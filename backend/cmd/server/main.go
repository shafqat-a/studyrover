// Command server is the StudyRover backend entrypoint. It is intentionally thin:
// configuration loading, the pgx pool + store, auth, the chi router (W02), and
// graceful shutdown all live behind app.Run (the DI seam in internal/app, W04).
package main

import (
	"log"

	"github.com/shafqat/studyrover/backend/internal/app"
)

func main() {
	if err := app.Run(); err != nil {
		log.Fatalf("server: %v", err)
	}
}
