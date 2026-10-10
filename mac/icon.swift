import AppKit

// Genera el ícono de Trazo: hoja de cuaderno con un trazo de tinta y un lápiz, sobre degradado azul.
func render(size: CGFloat, mac: Bool) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let ctx = NSGraphicsContext.current!.cgContext
    let s = size / 1024
    func C(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(srgbRed: r/255, green: g/255, blue: b/255, alpha: a) }
    let bgRect = mac ? NSRect(x: 100*s, y: 100*s, width: 824*s, height: 824*s) : NSRect(x: 0, y: 0, width: size, height: size)
    let bg = mac ? NSBezierPath(roundedRect: bgRect, xRadius: 185*s, yRadius: 185*s) : NSBezierPath(rect: bgRect)
    if mac {
        NSGraphicsContext.saveGraphicsState()
        let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(0.32); sh.shadowOffset = NSSize(width: 0, height: -12*s); sh.shadowBlurRadius = 28*s; sh.set()
        NSColor.black.setFill(); bg.fill()
        NSGraphicsContext.restoreGraphicsState()
    }
    NSGradient(colors: [C(104, 140, 255), C(63, 102, 240), C(36, 58, 186)])!.draw(in: bg, angle: -60)
    NSGradient(colors: [NSColor.white.withAlphaComponent(0.20), NSColor.white.withAlphaComponent(0)])!.draw(in: bg, angle: -90)

    // sistema de coordenadas de diseño 1024 con origen arriba-izquierda
    let k: CGFloat = mac ? 0.805 : 1.0
    ctx.saveGState()
    ctx.translateBy(x: size/2, y: size/2)
    ctx.scaleBy(x: s*k, y: -s*k)
    ctx.translateBy(x: -512, y: -512)

    // hoja inclinada con sombra
    ctx.saveGState()
    ctx.translateBy(x: 470, y: 520); ctx.rotate(by: -0.10); ctx.translateBy(x: -470, y: -520)
    ctx.setShadow(offset: CGSize(width: 0, height: 18), blur: 40, color: NSColor.black.withAlphaComponent(0.30).cgColor)
    let sheet = CGPath(roundedRect: CGRect(x: 230, y: 180, width: 480, height: 640), cornerWidth: 46, cornerHeight: 46, transform: nil)
    ctx.addPath(sheet); ctx.setFillColor(NSColor.white.cgColor); ctx.fillPath()
    ctx.setShadow(offset: .zero, blur: 0, color: nil)
    ctx.setStrokeColor(C(201, 212, 251).cgColor); ctx.setLineWidth(14); ctx.setLineCap(.round)
    for (i, w) in [330.0, 380, 300, 360].enumerated() { ctx.move(to: CGPoint(x: 300, y: 300 + Double(i) * 78)); ctx.addLine(to: CGPoint(x: 300 + w, y: 300 + Double(i) * 78)) }
    ctx.strokePath()
    ctx.restoreGState()

    // trazo de tinta
    ctx.setStrokeColor(C(36, 58, 186).cgColor); ctx.setLineWidth(30); ctx.setLineCap(.round); ctx.setLineJoin(.round)
    ctx.move(to: CGPoint(x: 290, y: 690))
    ctx.addCurve(to: CGPoint(x: 470, y: 640), control1: CGPoint(x: 350, y: 560), control2: CGPoint(x: 420, y: 760))
    ctx.addCurve(to: CGPoint(x: 640, y: 620), control1: CGPoint(x: 520, y: 520), control2: CGPoint(x: 580, y: 700))
    ctx.strokePath()

    // lápiz
    ctx.saveGState()
    ctx.translateBy(x: 690, y: 600); ctx.rotate(by: -1.08)
    ctx.setShadow(offset: CGSize(width: 0, height: 14), blur: 26, color: NSColor.black.withAlphaComponent(0.35).cgColor)
    let body = CGPath(roundedRect: CGRect(x: 40, y: -42, width: 360, height: 84), cornerWidth: 12, cornerHeight: 12, transform: nil)
    ctx.addPath(body); ctx.setFillColor(C(255, 201, 77).cgColor); ctx.fillPath()
    ctx.setShadow(offset: .zero, blur: 0, color: nil)
    ctx.setFillColor(C(244, 168, 40).cgColor); ctx.fill(CGRect(x: 40, y: 10, width: 360, height: 32))
    ctx.setFillColor(C(255, 122, 144).cgColor)
    ctx.addPath(CGPath(roundedRect: CGRect(x: 370, y: -42, width: 70, height: 84), cornerWidth: 22, cornerHeight: 22, transform: nil)); ctx.fillPath()
    ctx.setFillColor(C(200, 205, 215).cgColor); ctx.fill(CGRect(x: 350, y: -42, width: 30, height: 84))
    // punta de madera y grafito
    ctx.setFillColor(C(245, 222, 179).cgColor)
    ctx.move(to: CGPoint(x: 40, y: -42)); ctx.addLine(to: CGPoint(x: -40, y: 0)); ctx.addLine(to: CGPoint(x: 40, y: 42)); ctx.closePath(); ctx.fillPath()
    ctx.setFillColor(C(36, 40, 60).cgColor)
    ctx.move(to: CGPoint(x: -12, y: -15)); ctx.addLine(to: CGPoint(x: -40, y: 0)); ctx.addLine(to: CGPoint(x: -12, y: 15)); ctx.closePath(); ctx.fillPath()
    ctx.restoreGState()

    ctx.restoreGState()
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let out = CommandLine.arguments[1]
try! render(size: 1024, mac: true).write(to: URL(fileURLWithPath: out + "/icon-mac-1024.png"))
try! render(size: 1024, mac: false).write(to: URL(fileURLWithPath: out + "/icon-ios-1024.png"))
