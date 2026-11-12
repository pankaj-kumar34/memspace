package main

import (
	"embed"
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"redisian/backend/connection"
	"redisian/backend/services"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[string]("time")
	application.RegisterEvent[services.PubSubMessage]("pubsub:message")
}

func main() {
	connMgr := connection.NewConnectionManager()
	connService := services.NewConnectionService(connMgr)
	keyService := services.NewKeyService(connMgr)
	dataService := services.NewDataService(connMgr)
	cliService := services.NewCliService(connMgr)
	diagService := services.NewDiagnosticsService(connMgr)
	pubsubService := services.NewPubSubService(connMgr)

	app := application.New(application.Options{
		Name:        "Redisian",
		Description: "High-Performance Redis Desktop Client",
		Services: []application.Service{
			application.NewService(connService),
			application.NewService(keyService),
			application.NewService(dataService),
			application.NewService(cliService),
			application.NewService(diagService),
			application.NewService(pubsubService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Redisian",
		Width:  1280,
		Height: 800,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(15, 23, 42),
		URL:              "/",
	})

	go func() {
		for {
			now := time.Now().Format(time.RFC1123)
			app.Event.Emit("time", now)
			time.Sleep(time.Second)
		}
	}()

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
