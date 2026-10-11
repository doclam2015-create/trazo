import UIKit
import WebKit
import Speech
import UniformTypeIdentifiers

// Trazo para iPhone/iPad: la misma interfaz web dentro de un WKWebView, servida por trazo://app.
// Las notas viven en el almacenamiento propio de la app (iOS no las borra como hace Safari con las webs).
// Habla con iOS por window.webkit.messageHandlers.trazo: guardar, imprimir, copias en Archivos o iCloud Drive,
// transcripción en el dispositivo y subtítulos de YouTube.

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

// Selector de documentos con cierre (se retiene hasta que el usuario elige o cancela)
final class Picker: NSObject, UIDocumentPickerDelegate {
    static var live: [Picker] = []
    let done: ([URL]) -> Void
    init(_ done: @escaping ([URL]) -> Void) { self.done = done }
    func documentPicker(_ c: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done(urls); Picker.live.removeAll { $0 === self } }
    func documentPickerWasCancelled(_ c: UIDocumentPickerViewController) { done([]); Picker.live.removeAll { $0 === self } }
}

// Carpeta de copias: la elegida por el usuario (iCloud Drive u otra) o «En mi iPad › Trazo › Copias»
enum Backups {
    static let local = fm.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("Copias")
    static var folder: URL {
        if let d = UserDefaults.standard.data(forKey: "backupBookmark") {
            var stale = false
            if let u = try? URL(resolvingBookmarkData: d, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) { _ = u.startAccessingSecurityScopedResource(); return u }
        }
        return local
    }
    static var label: String {
        let f = folder
        if f == local { return "En mi " + (UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone") + " › Trazo › Copias" }
        if f.path.contains("com~apple~CloudDocs") { return "iCloud Drive › " + (f.path.components(separatedBy: "com~apple~CloudDocs/").last ?? f.lastPathComponent) }
        return f.lastPathComponent
    }
}

final class AppDelegate: UIResponder, UIApplicationDelegate {}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    let vc = WebVC()
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        w.rootViewController = vc
        w.makeKeyAndVisible()
        window = w
        vc.pending += options.urlContexts.map { $0.url }
    }
    func scene(_ scene: UIScene, openURLContexts c: Set<UIOpenURLContext>) { vc.receive(c.map { $0.url }) }
}

final class WebVC: UIViewController, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    var web: WKWebView!
    var pageReady = false, pending: [URL] = []

    override func loadView() {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(SchemeHandler(), forURLScheme: "trazo")
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "trazo")
        cfg.userContentController.addUserScript(WKUserScript(source: "window.TRAZO_IOS=true", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.websiteDataStore = .default()
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = .systemBackground
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.bounces = false
        web.isInspectable = true
        view = web
        web.load(URLRequest(url: URL(string: "trazo://app/index.html")!))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        // prueba automática en el simulador: TRAZO_EVAL=archivo.js ejecuta ese código e imprime el resultado
        if let f = ProcessInfo.processInfo.environment["TRAZO_EVAL"], let code = try? String(contentsOfFile: f, encoding: .utf8) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                self.web.callAsyncJavaScript(code, arguments: [:], in: nil, in: .page) { r in
                    switch r { case .success(let v): print("EVAL", v); case .failure(let e): print("EVAL ERROR", e) }
                    fflush(stdout)
                }
            }
        }
        if !pending.isEmpty { let u = pending; pending = []; DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { self.receive(u) } }
    }
    // PDF, imágenes y notas abiertas desde Archivos o «Compartir › Trazo»
    func receive(_ urls: [URL]) {
        if !pageReady { pending += urls; return }
        var list: [[String: String]] = []
        for u in urls where u.isFileURL {
            let sc = u.startAccessingSecurityScopedResource()
            defer { if sc { u.stopAccessingSecurityScopedResource() } }
            guard let d = try? Data(contentsOf: u) else { continue }
            list.append(["name": u.lastPathComponent, "data": d.base64EncodedString(), "type": UTType(filenameExtension: u.pathExtension)?.preferredMIMEType ?? ""])
            if u.path.contains("/Documents/Inbox/") { try? fm.removeItem(at: u) }
        }
        if let j = try? JSONSerialization.data(withJSONObject: list), let s = String(data: j, encoding: .utf8) {
            web.evaluateJavaScript("App.nativeOpen(\(s))", completionHandler: nil)
        }
    }

    func present(_ c: UIViewController) {
        if let p = c.popoverPresentationController {
            p.sourceView = web
            p.sourceRect = CGRect(x: web.bounds.midX, y: web.bounds.midY, width: 1, height: 1)
            p.permittedArrowDirections = []
        }
        var top: UIViewController = self
        while let p = top.presentedViewController { top = p }
        top.present(c, animated: true)
    }
    func pick(_ c: UIDocumentPickerViewController, _ done: @escaping ([URL]) -> Void) {
        let p = Picker(done); Picker.live.append(p)
        c.delegate = p
        present(c)
    }

    // MARK: puente JS
    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let b = message.body as? [String: Any], let op = b["op"] as? String else { replyHandler(nil, "mensaje inválido"); return }
        func fail(_ m: String) { replyHandler(nil, m) }
        switch op {
        case "saveAs":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("Datos inválidos"); return }
            let tmp = fm.temporaryDirectory.appendingPathComponent((b["name"] as? String ?? "archivo").replacingOccurrences(of: "/", with: "-"))
            do { try data.write(to: tmp) } catch { fail(error.localizedDescription); return }
            pick(UIDocumentPickerViewController(forExporting: [tmp], asCopy: true)) { urls in try? fm.removeItem(at: tmp); replyHandler(!urls.isEmpty, nil) }
        case "printPDF":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("No se pudo imprimir"); return }
            let p = UIPrintInteractionController.shared
            p.printingItem = data
            p.present(animated: true)
            replyHandler(true, nil)
        case "backup":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("Datos inválidos"); return }
            let dir = Backups.folder
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            let df = DateFormatter(); df.dateFormat = "yyyy-MM-dd HH.mm"
            let f = dir.appendingPathComponent("Trazo copia \(df.string(from: Date())).trazobackup")
            do {
                try data.write(to: f)
                // conserva las 7 copias más recientes
                let all = ((try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []).filter { $0.pathExtension == "trazobackup" }
                    .sorted { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) > ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
                for old in all.dropFirst(7) { try? fm.removeItem(at: old) }
                replyHandler(Backups.label, nil)
            } catch { fail(error.localizedDescription) }
        case "backupLabel":
            replyHandler(Backups.label, nil)
        case "backupDir":
            let c = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
            c.directoryURL = URL(fileURLWithPath: "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs")
            pick(c) { urls in
                guard let d = urls.first else { replyHandler(nil, nil); return }
                _ = d.startAccessingSecurityScopedResource()
                if let bm = try? d.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) { UserDefaults.standard.set(bm, forKey: "backupBookmark") }
                replyHandler(Backups.label, nil)
            }
        case "ai":
            fail("En iPhone/iPad usa una clave API (Ajustes › Inteligencia artificial).")
        case "transcribe":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("Audio inválido"); return }
            let ext = (b["mime"] as? String ?? "").contains("webm") ? "webm" : "m4a"
            let u = fm.temporaryDirectory.appendingPathComponent("trazo-audio-\(UUID().uuidString).\(ext)")
            try? data.write(to: u)
            let lang = b["lang"] as? String ?? "es-CL"
            SFSpeechRecognizer.requestAuthorization { st in
                guard st == .authorized else { DispatchQueue.main.async { fail("Permite el Reconocimiento de voz para Trazo en Ajustes › Privacidad.") }; return }
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
                let text = WebVC.youtubeTranscript(id)
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

    // enlaces externos en Safari; YouTube incrustado se permite; micrófono y cámara
    func webView(_ webView: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = a.request.url, let sc = url.scheme, !["trazo", "about", "blob", "data"].contains(sc) {
            if let f = a.targetFrame, !f.isMainFrame { decisionHandler(.allow); return }
            UIApplication.shared.open(url); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = a.request.url, url.scheme != "blob" { UIApplication.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: m, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a)
    }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
