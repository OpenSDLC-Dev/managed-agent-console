// Model-free integration driver. It compiles in a scratch module beneath the
// platform module namespace so it can exercise the real private handlers.
// The only substituted backends are in-memory blob storage and a local IdP
// HTTP client; PostgreSQL, migrations, login, authority and HTTP are real.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/api"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/blob/blobtest"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/identity"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/login"
	"github.com/OpenSDLC-Dev/managed-agent-platform/internal/modelgateway/admin"
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
		if err := api.EnsureAPIKey(ctx, pool, "bootstrap", "native-test-bootstrap"); err != nil {
			log.Fatal(err)
		}
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
			gateway, err := admin.New(admin.Config{Store: mgstore.New(pool), Cipher: cipher, BootstrapKey: "native-test-bootstrap", Login: manager, Prober: noModels{}})
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
