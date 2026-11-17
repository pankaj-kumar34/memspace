package main

import (
	"embed"
	"log"
	"time"

	"memspace/backend/connection"
	"memspace/backend/models"
	"memspace/backend/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[string]("time")
	application.RegisterEvent[services.PubSubMessage]("pubsub:message")
	application.RegisterEvent[models.MonitorEvent]("monitor:event")
	application.RegisterEvent[string]("monitor:stopped")
	application.RegisterEvent[models.UpdateProgress]("updater:progress")
	application.RegisterEvent[string]("nav:tab")
	application.RegisterEvent[string]("nav:toggle-sidebar")
	application.RegisterEvent[string]("nav:new-connection")
	application.RegisterEvent[string]("nav:shortcuts")
}

func main() {
	connMgr := connection.NewConnectionManager()
	connService := services.NewConnectionService(connMgr)
	keyService := services.NewKeyService(connMgr)
	dataService := services.NewDataService(connMgr)
	cliService := services.NewCliService(connMgr)
	diagService := services.NewDiagnosticsService(connMgr)
	pubsubService := services.NewPubSubService(connMgr)
	monitorService := services.NewMonitorService(connMgr)
	updaterService := services.NewUpdaterService()

	var app *application.App

	keyBindings := map[string]func(window application.Window){
		"cmdorctrl+1": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "terminal")
			}
		},
		"cmdorctrl+2": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "explorer")
			}
		},
		"cmdorctrl+3": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "diagnostics")
			}
		},
		"cmdorctrl+4": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "pubsub")
			}
		},
		"ctrl+1": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "terminal")
			}
		},
		"ctrl+2": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "explorer")
			}
		},
		"ctrl+3": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "diagnostics")
			}
		},
		"ctrl+4": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "pubsub")
			}
		},
		"option+1": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "terminal")
			}
		},
		"option+2": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "explorer")
			}
		},
		"option+3": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "diagnostics")
			}
		},
		"option+4": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "pubsub")
			}
		},
		"cmdorctrl+5": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "monitor")
			}
		},
		"ctrl+5": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "monitor")
			}
		},
		"option+5": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:tab", "monitor")
			}
		},
		"cmdorctrl+b": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:toggle-sidebar", "")
			}
		},
		"ctrl+b": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:toggle-sidebar", "")
			}
		},
		"cmdorctrl+n": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:new-connection", "")
			}
		},
		"ctrl+n": func(window application.Window) {
			if app != nil {
				app.Event.Emit("nav:new-connection", "")
			}
		},
	}

	app = application.New(application.Options{
		Name:        "Memspace",
		Description: "Native Desktop Client for Redis, Valkey & In-Memory Databases",
		Services: []application.Service{
			application.NewService(connService),
			application.NewService(keyService),
			application.NewService(dataService),
			application.NewService(cliService),
			application.NewService(diagService),
			application.NewService(pubsubService),
			application.NewService(monitorService),
			application.NewService(updaterService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
		KeyBindings: keyBindings,
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Memspace",
		Width:  1280,
		Height: 800,
		Mac: application.MacWindow{
			Backdrop:   application.MacBackdropNormal,
			TitleBar:   application.MacTitleBarDefault,
			Appearance: application.NSAppearanceNameVibrantLight,
		},
		BackgroundColour: application.NewRGB(15, 23, 42),
		URL:              "/",
		KeyBindings:      keyBindings,
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
