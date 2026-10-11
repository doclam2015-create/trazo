import Cocoa
import WebKit
import PDFKit
import Speech
import UniformTypeIdentifiers

// Trazo para macOS: ventana nativa con WKWebView. La interfaz se sirve por el esquema trazo://app
// y habla con el Mac por window.webkit.messageHandlers.trazo (guardar, imprimir, IA con tus cuentas, transcribir, copias).

let fm = FileManager.default

final class SchemeHandler: NSObject, WKURLSchemeHandler {
    let res = Bundle.main.resourceURL!
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path.removingPercentEncoding ?? url.path
        if path == "/" || path.isEmpty { path = "/index.html" }
        let f = res.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard f.path.hasPrefix(res.standardizedFileURL.path), let data = try? Data(contentsOf: f) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
            task.didFinish(); return
        }
        let mime = UTType(filenameExtension: f.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": mime, "Content-Length": "\(data.count)", "Cache-Control": "no-cache"])!)
        task.didReceive(data)
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

// Ejecuta un programa de línea de comandos con tus sesiones (Codex, Claude, Gemini)
func runCLI(_ exe: String, _ args: [String], stdin: String, timeout: TimeInterval = 240) throws -> String {
    let p = Process()
    let paths = ["/usr/local/bin", "/opt/homebrew/bin", fm.homeDirectoryForCurrentUser.path + "/.local/bin", fm.homeDirectoryForCurrentUser.path + "/.npm-global/bin", "/usr/bin", "/bin"]
    guard let bin = paths.map({ $0 + "/" + exe }).first(where: { fm.isExecutableFile(atPath: $0) }) else {
        throw NSError(domain: "trazo", code: 1, userInfo: [NSLocalizedDescriptionKey: "No se encontró «\(exe)» en este Mac. Instálalo e inicia sesión, o elige otro proveedor en Ajustes."])
    }
    p.executableURL = URL(fileURLWithPath: bin)
    p.arguments = args
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = paths.joined(separator: ":") + ":" + (env["PATH"] ?? "")
    env["NO_COLOR"] = "1"
    p.environment = env
    let tmp = fm.temporaryDirectory.appendingPathComponent("trazo-ai", isDirectory: true)
    try? fm.createDirectory(at: tmp, withIntermediateDirectories: true)
    p.currentDirectoryURL = tmp
    let inP = Pipe(), outP = Pipe(), errP = Pipe()
    p.standardInput = inP; p.standardOutput = outP; p.standardError = errP
    try p.run()
    inP.fileHandleForWriting.write(stdin.data(using: .utf8)!)
    try? inP.fileHandleForWriting.close()
    var out = Data(), err = Data()
    let g = DispatchGroup()
    g.enter(); DispatchQueue.global().async { out = outP.fileHandleForReading.readDataToEndOfFile(); g.leave() }
    g.enter(); DispatchQueue.global().async { err = errP.fileHandleForReading.readDataToEndOfFile(); g.leave() }
    if g.wait(timeout: .now() + timeout) == .timedOut { p.terminate(); throw NSError(domain: "trazo", code: 2, userInfo: [NSLocalizedDescriptionKey: "La IA tardó demasiado en responder."]) }
    p.waitUntilExit()
    let o = String(data: out, encoding: .utf8) ?? ""
    if p.terminationStatus != 0 && o.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        let e = String(data: err, encoding: .utf8) ?? ""
        throw NSError(domain: "trazo", code: 3, userInfo: [NSLocalizedDescriptionKey: "«\(exe)» respondió con un error: " + String(e.suffix(400))])
    }
    return o
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(SchemeHandler(), forURLScheme: "trazo")
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "trazo")
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.websiteDataStore = .default()
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsMagnification = false
        if #available(macOS 13.3, *) { web.isInspectable = true }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 880),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Trazo"
        window.titlebarAppearsTransparent = true
        window.minSize = NSSize(width: 480, height: 560)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("TrazoMain")
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: URL(string: "trazo://app/index.html")!))
        buildMenu()
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // archivos abiertos desde Finder o arrastrados al Dock
    var pageReady = false, pending: [URL] = []
    func application(_ application: NSApplication, open urls: [URL]) { if pageReady { receive(urls) } else { pending += urls } }
    func receive(_ urls: [URL]) {
        window.makeKeyAndOrderFront(nil)
        var list: [[String: String]] = []
        for u in urls {
            guard let d = try? Data(contentsOf: u) else { continue }
            list.append(["name": u.lastPathComponent, "data": d.base64EncodedString(), "type": UTType(filenameExtension: u.pathExtension)?.preferredMIMEType ?? ""])
        }
        if let j = try? JSONSerialization.data(withJSONObject: list), let s = String(data: j, encoding: .utf8) {
            web.evaluateJavaScript("App.nativeOpen(\(s))", completionHandler: nil)
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        if let f = ProcessInfo.processInfo.environment["TRAZO_EVAL"], let code = try? String(contentsOfFile: f, encoding: .utf8) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                self.web.callAsyncJavaScript(code, arguments: [:], in: nil, in: .page) { r in
                    switch r { case .success(let v): print("EVAL", v); case .failure(let e): print("EVAL ERROR", e) }
                    exit(0)
                }
            }
        }
        if !pending.isEmpty { let u = pending; pending = []; DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.receive(u) } }
    }

    // MARK: puente JS
    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let b = message.body as? [String: Any], let op = b["op"] as? String else { replyHandler(nil, "mensaje inválido"); return }
        func fail(_ m: String) { replyHandler(nil, m) }
        switch op {
        case "saveAs":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("Datos inválidos"); return }
            let p = NSSavePanel(); p.nameFieldStringValue = b["name"] as? String ?? "archivo"; p.canCreateDirectories = true
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let d = p.url else { replyHandler(false, nil); return }
                do { try data.write(to: d); replyHandler(true, nil); NSWorkspace.shared.activateFileViewerSelecting([d]) } catch { fail(error.localizedDescription) }
            }
        case "printPDF":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s), let doc = PDFDocument(data: data),
                  let op = doc.printOperation(for: NSPrintInfo.shared, scalingMode: .pageScaleToFit, autoRotate: true) else { fail("No se pudo imprimir"); return }
            op.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
            replyHandler(true, nil)
        case "backup":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("Datos inválidos"); return }
            let icloud = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs")
            let dir = (fm.fileExists(atPath: icloud.path) ? icloud : fm.homeDirectoryForCurrentUser.appendingPathComponent("Documents")).appendingPathComponent("Trazo")
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd HH.mm"
            let f = dir.appendingPathComponent("Trazo copia \(df.string(from: Date())).trazobackup")
            do {
                try data.write(to: f)
                // conserva las 7 copias más recientes
                let all = ((try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []).filter { $0.pathExtension == "trazobackup" }
                    .sorted { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) > ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
                for old in all.dropFirst(7) { try? fm.removeItem(at: old) }
                replyHandler(f.path, nil)
            } catch { fail(error.localizedDescription) }
        case "ai":
            let provider = b["provider"] as? String ?? "codex", prompt = b["prompt"] as? String ?? ""
            var imgPath: String? = nil
            if let s = b["image"] as? String, let d = Data(base64Encoded: s) {
                let u = fm.temporaryDirectory.appendingPathComponent("trazo-ai/img-\(UUID().uuidString).png")
                try? fm.createDirectory(at: u.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? d.write(to: u); imgPath = u.path
            }
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    var out = ""
                    switch provider {
                    case "claude":
                        var p = prompt
                        var args = ["-p", "--output-format", "text"]
                        if let ip = imgPath { p += "\n\nLa imagen está en: \(ip) (léela con la herramienta Read)."; args += ["--allowedTools", "Read", "--add-dir", (ip as NSString).deletingLastPathComponent] }
                        out = try runCLI("claude", args, stdin: p)
                    case "gemini-cli":
                        var p = prompt
                        if let ip = imgPath { p += "\n\n@\(ip)" }
                        out = try runCLI("gemini", ["-p", "Responde a lo anterior."], stdin: p)
                    default:
                        let outFile = fm.temporaryDirectory.appendingPathComponent("trazo-ai/out-\(UUID().uuidString).txt")
                        var args = ["exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only", "--color", "never", "-o", outFile.path]
                        if let ip = imgPath { args += ["-i", ip] }
                        args.append("-")
                        let raw = try runCLI("codex", args, stdin: prompt)
                        out = (try? String(contentsOf: outFile, encoding: .utf8)) ?? raw
                        try? fm.removeItem(at: outFile)
                    }
                    if let ip = imgPath { try? fm.removeItem(atPath: ip) }
                    DispatchQueue.main.async { replyHandler(out.trimmingCharacters(in: .whitespacesAndNewlines), nil) }
                } catch { DispatchQueue.main.async { fail(error.localizedDescription) } }
            }
        case "transcribe":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("Audio inválido"); return }
            let ext = (b["mime"] as? String ?? "").contains("webm") ? "webm" : "m4a"
            let u = fm.temporaryDirectory.appendingPathComponent("trazo-audio-\(UUID().uuidString).\(ext)")
            try? data.write(to: u)
            let lang = b["lang"] as? String ?? "es-CL"
            SFSpeechRecognizer.requestAuthorization { st in
                guard st == .authorized else { DispatchQueue.main.async { fail("Permite el Reconocimiento de voz para Trazo en Ajustes del Sistema › Privacidad.") }; return }
                guard let rec = SFSpeechRecognizer(locale: Locale(identifier: lang)) ?? SFSpeechRecognizer(locale: Locale(identifier: "es-ES")), rec.isAvailable else {
                    DispatchQueue.main.async { fail("El reconocimiento de voz no está disponible.") }; return
                }
                let req = SFSpeechURLRecognitionRequest(url: u)
                if rec.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
                req.addsPunctuation = true
                var done = false
                rec.recognitionTask(with: req) { result, error in
                    if done { return }
                    if let r = result, r.isFinal { done = true; try? fm.removeItem(at: u); DispatchQueue.main.async { replyHandler(r.bestTranscription.formattedString, nil) } }
                    else if let e = error { done = true; try? fm.removeItem(at: u); DispatchQueue.main.async { fail(e.localizedDescription) } }
                }
            }
        case "yt":
            let id = b["id"] as? String ?? ""
            DispatchQueue.global().async {
                let text = AppDelegate.youtubeTranscript(id)
                DispatchQueue.main.async { replyHandler(text, nil) }
            }
        default:
            fail("Operación desconocida: \(op)")
        }
    }

    // Transcripción pública de YouTube (si el video tiene subtítulos), por la API interna con el cliente de iOS
    static func youtubeTranscript(_ id: String) -> String {
        func send(_ r: URLRequest) -> Data? {
            let sem = DispatchSemaphore(value: 0); var out: Data?
            URLSession.shared.dataTask(with: r) { d, _, _ in out = d; sem.signal() }.resume()
            _ = sem.wait(timeout: .now() + 20); return out
        }
        var r = URLRequest(url: URL(string: "https://www.youtube.com/youtubei/v1/player?prettyPrint=false")!)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.setValue("com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X;)", forHTTPHeaderField: "User-Agent")
        r.httpBody = try? JSONSerialization.data(withJSONObject: ["videoId": id, "context": ["client": ["clientName": "IOS", "clientVersion": "20.10.4", "deviceModel": "iPhone16,2", "hl": "es"]]])
        guard let d = send(r), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let tracks = ((j["captions"] as? [String: Any])?["playerCaptionsTracklistRenderer"] as? [String: Any])?["captionTracks"] as? [[String: Any]], !tracks.isEmpty else { return "" }
        let track = tracks.first(where: { ($0["languageCode"] as? String ?? "").hasPrefix("es") }) ?? tracks[0]
        guard let base = track["baseUrl"] as? String, let u = URL(string: base + "&fmt=json3"), let cd = send(URLRequest(url: u)),
              let cj = try? JSONSerialization.jsonObject(with: cd) as? [String: Any], let events = cj["events"] as? [[String: Any]] else { return "" }
        var out = ""
        for e in events { for s in (e["segs"] as? [[String: Any]] ?? []) { out += (s["utf8"] as? String ?? "") } ; out += " " }
        return out.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: "  ", with: " ").trimmingCharacters(in: .whitespaces)
    }

    // enlaces externos al navegador; diálogos nativos para <input type=file>; micrófono y cámara
    func webView(_ webView: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = a.request.url, let sc = url.scheme, !["trazo", "about", "blob", "data"].contains(sc), a.targetFrame?.isMainFrame ?? true {
            if url.host?.contains("youtube") == true && a.targetFrame != nil && !(a.targetFrame!.isMainFrame) { decisionHandler(.allow); return }
            NSWorkspace.shared.open(url); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = a.request.url {
            if url.scheme == "blob" { return nil }
            NSWorkspace.shared.open(url)
        }
        return nil
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel(); p.allowsMultipleSelection = parameters.allowsMultipleSelection; p.canChooseDirectories = false
        p.beginSheetModal(for: window) { r in completionHandler(r == .OK ? p.urls : nil) }
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = message; a.runModal(); completionHandler()
    }

    // MARK: menús
    @objc func js(_ sender: NSMenuItem) { if let c = sender.representedObject as? String { web.evaluateJavaScript(c, completionHandler: nil) } }
    func item(_ t: String, _ code: String, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
        let it = NSMenuItem(title: t, action: #selector(js(_:)), keyEquivalent: key)
        it.keyEquivalentModifierMask = mods; it.representedObject = code; it.target = self
        return it
    }
    func buildMenu() {
        let bar = NSMenu()
        let appItem = NSMenuItem(); bar.addItem(appItem)
        let am = NSMenu()
        am.addItem(withTitle: "Acerca de Trazo", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        am.addItem(.separator())
        am.addItem(item("Ajustes…", "App.settings()", ","))
        am.addItem(.separator())
        am.addItem(withTitle: "Ocultar Trazo", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        am.addItem(withTitle: "Ocultar otros", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h").keyEquivalentModifierMask = [.command, .option]
        am.addItem(.separator())
        am.addItem(withTitle: "Salir de Trazo", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = am

        let fItem = NSMenuItem(); bar.addItem(fItem)
        let f = NSMenu(title: "Archivo")
        f.addItem(item("Nota nueva", "Editor.isOpen() ? Editor.close().then(() => App.newNote()) : App.newNote()", "n"))
        f.addItem(item("Importar PDF o imágenes…", "Editor.isOpen() ? Editor.importInto() : App.importPick()", "o"))
        f.addItem(item("Exportar como PDF…", "Editor.isOpen() && Editor.exportPDF()", "e"))
        f.addItem(item("Grabar audio", "Editor.isOpen() ? Editor.toggleRecord() : App.createNote().then(() => setTimeout(() => Editor.startRec(), 400))", "r", [.command, .shift]))
        f.addItem(.separator())
        f.addItem(item("Copia de seguridad…", "Backup.exportAll()", "b", [.command, .shift]))
        f.addItem(item("Abrir carpeta de copias en Finder", "void 0", ""))
        f.items.last?.action = #selector(openBackups); f.items.last?.target = self
        f.addItem(.separator())
        f.addItem(item("Cerrar nota", "Editor.isOpen() && Editor.close()", "w"))
        fItem.submenu = f

        let eItem = NSMenuItem(); bar.addItem(eItem)
        let e = NSMenu(title: "Edición")
        let txt = "(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))"
        e.addItem(item("Deshacer", "\(txt) ? document.execCommand('undo') : Editor.isOpen() && Editor.undo()", "z"))
        e.addItem(item("Rehacer", "\(txt) ? document.execCommand('redo') : Editor.isOpen() && Editor.redo()", "z", [.command, .shift]))
        e.addItem(.separator())
        e.addItem(withTitle: "Cortar", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        e.addItem(withTitle: "Copiar", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        e.addItem(withTitle: "Pegar", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        e.addItem(withTitle: "Seleccionar todo", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        e.addItem(.separator())
        e.addItem(item("Buscar", "Editor.isOpen() ? null : document.getElementById('q').focus()", "f"))
        e.addItem(.separator())
        let em = NSMenuItem(title: "Emoji y símbolos", action: #selector(NSApplication.orderFrontCharacterPalette(_:)), keyEquivalent: " "); em.keyEquivalentModifierMask = [.command, .control]; e.addItem(em)
        eItem.submenu = e

        let vItem = NSMenuItem(); bar.addItem(vItem)
        let v = NSMenu(title: "Ver")
        v.addItem(item("Inicio", "Editor.isOpen() ? Editor.close().then(() => App.go('home')) : App.go('home')", "1"))
        v.addItem(item("Notas", "Editor.isOpen() ? Editor.close().then(() => App.go('notes')) : App.go('notes')", "2"))
        v.addItem(item("Galería", "Editor.isOpen() ? Editor.close().then(() => App.go('gallery')) : App.go('gallery')", "3"))
        v.addItem(.separator())
        v.addItem(item("Acercar", "Editor.isOpen() && Editor.zoomIn()", "+"))
        v.addItem(item("Alejar", "Editor.isOpen() && Editor.zoomOut()", "-"))
        v.addItem(item("Ajustar al ancho", "Editor.isOpen() && Editor.zoomFit()", "0"))
        v.addItem(.separator())
        v.addItem(item("Notas inteligentes", "Editor.isOpen() && Smart.panel(Editor.note)", "i", [.command, .shift]))
        v.addItem(withTitle: "Pantalla completa", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f").keyEquivalentModifierMask = [.command, .control]
        vItem.submenu = v

        let wItem = NSMenuItem(); bar.addItem(wItem)
        let w = NSMenu(title: "Ventana")
        w.addItem(withTitle: "Minimizar", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        w.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        wItem.submenu = w
        NSApp.windowsMenu = w

        let hItem = NSMenuItem(); bar.addItem(hItem)
        let hm = NSMenu(title: "Ayuda")
        hm.addItem(item("Ayuda y atajos de Trazo", "App.settings('help')", "?"))
        hItem.submenu = hm
        NSApp.helpMenu = hm
        NSApp.mainMenu = bar
    }
    @objc func openBackups() {
        let icloud = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs/Trazo")
        try? fm.createDirectory(at: icloud, withIntermediateDirectories: true)
        NSWorkspace.shared.open(icloud)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
