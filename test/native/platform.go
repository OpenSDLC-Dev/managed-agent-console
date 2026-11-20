// Model-free integration driver. It compiles in a scratch module beneath the
// platform module namespace so it can exercise the real private handlers.
// Blob storage, the IdP and model replies use local fixtures. PostgreSQL,
// migrations, login, authority and gateway routing are real.
package main

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/api"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/blob/blobtest"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/identity"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/login"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/modelgateway"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/modelgateway/admin"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/modelgateway/catalog"
	mgstore "github.com/OpenSDLC-Dev/managed-agent-platform/internal/modelgateway/store"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/secrets/local"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/store"
)

type noModels struct{}

func (noModels) CheckCredential(context.Context, mgstore.Provider, mgstore.Credential) []admin.CredentialCheck {
	panic("model/vendor calls are forbidden in native integration")
}
func (noModels) TestDeployment(context.Context, mgstore.Deployment, mgstore.Provider, []mgstore.Credential) []admin.DeploymentTest {
	panic("model/vendor calls are forbidden in native integration")
}

// The fixture cannot make any network request, even with another provider configured.
type playgroundVendor struct{}

func (playgroundVendor) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.URL.Host != "playground.invalid" || r.URL.Path != "/v1/messages" || r.Method != http.MethodPost {
		return nil, errors.New("only the local Playground fixture can answer inference")
	}
	defer r.Body.Close()
	request, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, err
	}
	const start = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_fixture\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"fixture-playground\",\"content\":[],\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{\"input_tokens\":3,\"output_tokens\":0}}}\n\n" +
		"event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n" +
		"event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Fixture response\"}}\n\n"
	const end = "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n" +
		"event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":2}}\n\n" +
		"event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
	var body io.ReadCloser = io.NopCloser(strings.NewReader(start + end))
	if strings.Contains(string(request), `"content":"hold fixture stream"`) {
		reader, writer := io.Pipe()
		go func() {
			defer writer.Close()
			if _, err := io.WriteString(writer, start); err == nil {
				<-r.Context().Done()
			}
		}()
		body = reader
	}
	return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": {"text/event-stream"}}, Body: body}, nil
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	var servers []*http.Server
	for _, mode := range []login.Mode{login.ModePassword, login.ModeOIDC} {
		pool, err := store.Open(ctx, os.Getenv("DATABASE_BASE")+"/native_"+string(mode)+"?sslmode=disable")
		if err != nil {
			log.Fatal(err)
		}
		defer pool.Close()
		origin, addr := "http://127.0.0.1:38200", "127.0.0.1:38110"
		if mode == login.ModeOIDC {
			origin, addr = "http://127.0.0.1:38201", "127.0.0.1:38111"
		}
		manager := login.New(pool, login.Config{Mode: mode, PublicOrigin: origin, Development: true})
		var verifier *identity.Verifier
		var rp *identity.RelyingParty
		var code string
		if mode == login.ModeOIDC {
			// Loopback fixture admission only. The production verifier's dial guard
			// remains unchanged and is not what this browser integration claims to test.
			cfg := identity.Config{Mode: identity.ModeOIDC, Issuer: "http://127.0.0.1:38130", Audience: "managed-agent-console", HTTPClient: &http.Client{Transport: &http.Transport{Proxy: nil}}}
			verifier, err = identity.New(ctx, cfg)
			if err != nil {
				log.Fatal(err)
			}
			rp, err = identity.NewRelyingParty(ctx, cfg, "managed-agent-console", "", origin+"/api/auth/callback")
			if err != nil {
				log.Fatal(err)
			}
			code, err = api.MintSetupCode(ctx, pool, false)
		} else {
			code, err = api.MintPasswordSetupCode(ctx, pool)
		}
		if err != nil {
			log.Fatal(err)
		}
		if err = os.WriteFile(filepath.Join(os.Getenv("NATIVE_RUN_DIR"), string(mode)+"-setup-code"), []byte(code), 0600); err != nil {
			log.Fatal(err)
		}
		cipher, err := local.New(local.Config{KeyID: "native-fixture", Key: make([]byte, 32)})
		if err != nil {
			log.Fatal(err)
		}
		handler := api.NewHandler(pool, blobtest.Mem(), cipher, verifier, api.WithLogin(manager, rp))
		server := &http.Server{Addr: addr, Handler: handler}
		servers = append(servers, server)
		go func() {
			if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Fatal(err)
			}
		}()
		{
			gatewayStore := mgstore.New(pool)
			gatewayAdmin, err := admin.New(admin.Config{Store: gatewayStore, Cipher: cipher, Login: manager, Prober: noModels{}})
			if err != nil {
				log.Fatal(err)
			}
			models, err := catalog.New(ctx, pool, 100*time.Millisecond)
			if err != nil {
				log.Fatal(err)
			}
			done := make(chan struct{})
			go func() { defer close(done); models.Run(ctx) }()
			defer func() { cancel(); <-done }()
			gateway, err := modelgateway.New(modelgateway.Config{
				Catalog: models, Store: gatewayStore, Keys: pool, Cipher: cipher,
				Login: manager, Admin: gatewayAdmin, Client: &http.Client{Transport: playgroundVendor{}},
			})
			if err != nil {
				log.Fatal(err)
			}
			gatewayAddr := "127.0.0.1:38120"
			if mode == login.ModeOIDC {
				gatewayAddr = "127.0.0.1:38121"
			}
			server := &http.Server{Addr: gatewayAddr, Handler: gateway}
			servers = append(servers, server)
			go func() {
				if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					log.Fatal(err)
				}
			}()
		}
	}
	<-ctx.Done()
	shutdown, stop := context.WithTimeout(context.Background(), 5*time.Second)
	defer stop()
	for _, server := range servers {
		if err := server.Shutdown(shutdown); err != nil {
			_ = server.Close()
		}
	}
}
