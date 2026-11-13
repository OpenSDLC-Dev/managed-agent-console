// Test-only, model-free SDK probe. The runtime builds this in module/client,
// never alongside the fixture's main. Credentials enter only through stdin.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	anthropic "github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

type input struct {
	BaseURL string `json:"base_url"`
	Key     string `json:"key"`
	Header  string `json:"header"`
}

type result struct {
	Status         map[string]int             `json:"status"`
	StoreID        string                     `json:"store_id,omitempty"`
	MemoryID       string                     `json:"memory_id,omitempty"`
	VersionID      string                     `json:"version_id,omitempty"`
	UpdatedVersion string                     `json:"updated_version_id,omitempty"`
	Actors         map[string]json.RawMessage `json:"actors,omitempty"`
}

func main() {
	// No SDK error text, request dump or input ever reaches stdout/stderr.
	var in input
	decoder := json.NewDecoder(io.LimitReader(os.Stdin, 16384))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&in) != nil || decoder.Decode(new(any)) != io.EOF {
		os.Exit(2)
	}
	u, err := url.Parse(in.BaseURL)
	if err != nil || u.Scheme != "http" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || !net.ParseIP(u.Hostname()).IsLoopback() || in.Key == "" {
		os.Exit(2)
	}
	transport := &http.Transport{Proxy: nil}
	defer transport.CloseIdleConnections()
	options := []option.RequestOption{
		option.WithoutEnvironmentDefaults(), option.WithBaseURL(in.BaseURL),
		option.WithMaxRetries(0), option.WithHTTPClient(&http.Client{
			Transport: transport, Timeout: 10 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		}),
	}
	switch in.Header {
	case "x-api-key":
		options = append(options, option.WithAPIKey(in.Key))
	case "bearer":
		options = append(options, option.WithAuthToken(in.Key))
	default:
		os.Exit(2)
	}
	client := anthropic.NewClient(options...)
	out := result{Status: map[string]int{}, Actors: map[string]json.RawMessage{}}
	defer func() {
		encoded, err := json.Marshal(out)
		if err != nil || bytes.Contains(encoded, []byte(in.Key)) {
			os.Exit(3)
		}
		_, _ = os.Stdout.Write(append(encoded, '\n'))
	}()
	var response *http.Response
	check := func(step string, err error) bool {
		status := 0
		if response != nil {
			status = response.StatusCode
		}
		var apiError *anthropic.Error
		if errors.As(err, &apiError) {
			status = apiError.StatusCode
		}
		out.Status[step] = status
		response = nil
		return err == nil && status == 200
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, err = client.Beta.Agents.List(ctx, anthropic.BetaAgentListParams{Limit: anthropic.Int(1)}, option.WithResponseInto(&response))
	if !check("agents", err) {
		return
	}
	store, err := client.Beta.MemoryStores.New(ctx, anthropic.BetaMemoryStoreNewParams{Name: "native SDK actors"}, option.WithResponseInto(&response))
	if !check("store", err) {
		return
	}
	out.StoreID = store.ID
	memory, err := client.Beta.MemoryStores.Memories.New(ctx, store.ID, anthropic.BetaMemoryStoreMemoryNewParams{Path: "/sdk.md", Content: anthropic.String("")}, option.WithResponseInto(&response))
	if !check("create", err) {
		return
	}
	out.MemoryID, out.VersionID = memory.ID, memory.MemoryVersionID
	updated, err := client.Beta.MemoryStores.Memories.Update(ctx, memory.ID, anthropic.BetaMemoryStoreMemoryUpdateParams{MemoryStoreID: store.ID, Content: anthropic.String("second version")}, option.WithResponseInto(&response))
	if !check("update", err) {
		return
	}
	out.UpdatedVersion = updated.MemoryVersionID
	_, err = client.Beta.MemoryStores.MemoryVersions.Redact(ctx, out.VersionID, anthropic.BetaMemoryStoreMemoryVersionRedactParams{MemoryStoreID: store.ID}, option.WithResponseInto(&response))
	// Developers can write but cannot redact. Read back even on this expected 403.
	check("redact", err)
	version, err := client.Beta.MemoryStores.MemoryVersions.Get(ctx, out.VersionID, anthropic.BetaMemoryStoreMemoryVersionGetParams{MemoryStoreID: store.ID}, option.WithResponseInto(&response))
	if !check("readback", err) {
		return
	}
	for field, raw := range map[string]string{"created_by": version.CreatedBy.RawJSON(), "redacted_by": version.RedactedBy.RawJSON()} {
		// This SDK leaves a null union's RawJSON empty. A nil RawMessage
		// preserves null; a non-nil empty slice is invalid JSON.
		out.Actors[field] = nil
		if raw != "" {
			out.Actors[field] = json.RawMessage(raw)
		}
	}
}
