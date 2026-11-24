import SwiftUI

// 경로 선 v2(SPEC_LA4 3절). 시안 코드 _work3/l4.js를 그대로 옮겼다:
// 맞추기(fit) → 매끈하게(1-2-1 평균 → 단순화 ε → 모서리 깎기 두 번, 출발 · 지금 위치 고정) → 선 쌓기(marks).
// 모두 Path · stroke · 그라데이션만 쓴다. 블러 · 3D 변환 · 매 프레임 움직임 없음.

enum RouteMath {
  /// ContentState.route(x0, y0, x1, y1 …)를 점으로. 같은 점이 이어지면 하나로.
  /// 새 모양은 0~1000 정수 격자(가로 · 세로 같은 배율)라 그대로 쓴다. 옛 모양(옛 JS가 OTA로 올 때: 96 × 64 상자에 맞춘 뒤
  /// 가로 ÷ 96, 세로 ÷ 64 한 0~1 값)은 값이 모두 1 이하라 알아보고, 상자 크기를 다시 곱해 비율을 되돌린다
  static func points(_ flat: [Double]) -> [CGPoint] {
    let legacy = !flat.isEmpty && flat.allSatisfy { $0 <= 1 }
    let sx: Double = legacy ? 96 : 1, sy: Double = legacy ? 64 : 1
    var out: [CGPoint] = []
    out.reserveCapacity(flat.count / 2)
    var i = 0
    while i + 1 < flat.count {
      let q = CGPoint(x: flat[i] * sx, y: flat[i + 1] * sy)
      if q.x.isFinite, q.y.isFinite, out.last != q { out.append(q) }
      i += 2
    }
    return out
  }

  /// 비율 그대로 상자 가운데에 맞추기(l4Fit)
  static func fit(_ pts: [CGPoint], into r: CGRect) -> [CGPoint] {
    guard let first = pts.first else { return [] }
    var x0 = first.x, x1 = first.x, y0 = first.y, y1 = first.y
    for q in pts {
      x0 = min(x0, q.x); x1 = max(x1, q.x); y0 = min(y0, q.y); y1 = max(y1, q.y)
    }
    let sx = x1 > x0 ? r.width / (x1 - x0) : .greatestFiniteMagnitude
    let sy = y1 > y0 ? r.height / (y1 - y0) : .greatestFiniteMagnitude
    var s = min(sx, sy)
    if s == .greatestFiniteMagnitude { s = 1 }
    let ox = r.minX + (r.width - (x1 - x0) * s) / 2 - x0 * s
    let oy = r.minY + (r.height - (y1 - y0) * s) / 2 - y0 * s
    return pts.map { CGPoint(x: ox + $0.x * s, y: oy + $0.y * s) }
  }

  /// ① 1-2-1 평균 한 번(양 끝 고정)
  static func average(_ p: [CGPoint]) -> [CGPoint] {
    guard p.count >= 3 else { return p }
    var out = p
    for i in 1..<(p.count - 1) {
      out[i] = CGPoint(x: (p[i - 1].x + 2 * p[i].x + p[i + 1].x) / 4, y: (p[i - 1].y + 2 * p[i].y + p[i + 1].y) / 4)
    }
    return out
  }

  /// ② Ramer–Douglas–Peucker: eps(pt)보다 작은 떨림을 지운다. 길모퉁이는 eps보다 크게 벗어나서 남는다
  static func simplify(_ p: [CGPoint], eps: CGFloat) -> [CGPoint] {
    guard p.count >= 3 else { return p }
    var keep = [Bool](repeating: false, count: p.count)
    keep[0] = true
    keep[p.count - 1] = true
    var stack = [(0, p.count - 1)]
    while let span = stack.popLast() {
      let i0 = span.0, i1 = span.1
      guard i1 - i0 >= 2 else { continue }
      let a = p[i0], dx = p[i1].x - a.x, dy = p[i1].y - a.y
      let len = hypot(dx, dy)
      var dm: CGFloat = 0
      var k = -1
      for i in (i0 + 1)..<i1 {
        // 처음과 끝이 같은 점(제자리로 돌아온 고리)이면 직선 거리 대신 그 점에서의 거리(l4.js는 여기서 고리가 점 하나로 줄어든다)
        let d = len > 0 ? abs(dx * (a.y - p[i].y) - dy * (a.x - p[i].x)) / len : hypot(p[i].x - a.x, p[i].y - a.y)
        if d > dm { dm = d; k = i }
      }
      if dm > eps, k >= 0 {
        keep[k] = true
        stack.append((i0, k))
        stack.append((k, i1))
      }
    }
    return p.indices.filter { keep[$0] }.map { p[$0] }
  }

  /// ③ 모서리 깎기(Chaikin 변형): 모서리마다 양옆 구간의 1/4, 최대 rmax(pt)까지만. 곧은 길은 곧게, 모퉁이만 둥글게
  static func cutCorners(_ p: [CGPoint], rmax: CGFloat) -> [CGPoint] {
    guard p.count >= 3 else { return p }
    var out = [p[0]]
    out.reserveCapacity(p.count * 2)
    for i in 1..<(p.count - 1) {
      let a = p[i - 1], b = p[i], c = p[i + 1]
      let l1 = nonZero(hypot(b.x - a.x, b.y - a.y)), l2 = nonZero(hypot(c.x - b.x, c.y - b.y))
      let f1 = min(l1 * 0.25, rmax) / l1, f2 = min(l2 * 0.25, rmax) / l2
      out.append(CGPoint(x: b.x + (a.x - b.x) * f1, y: b.y + (a.y - b.y) * f1))
      out.append(CGPoint(x: b.x + (c.x - b.x) * f2, y: b.y + (c.y - b.y) * f2))
    }
    out.append(p[p.count - 1])
    return out
  }

  /// 매끈하게: ① → ② → ③ 두 번. 출발 점과 지금 위치(마지막 점)는 움직이지 않는다
  static func smooth(_ p: [CGPoint], eps: CGFloat = 1, r1: CGFloat = 6, r2: CGFloat = 3) -> [CGPoint] {
    guard p.count >= 3 else { return p }
    return cutCorners(cutCorners(simplify(average(p), eps: eps), rmax: r1), rmax: r2)
  }

  /// 앱 점 구름과 같은 흔들림 식(cmp/RouteMap.tsx). −1 ~ 1, 그릴 때마다 같은 자리
  static func jitter(_ i: Int, _ k: Int) -> CGFloat {
    let x = sin(Double(i) * 12.9898 + Double(k) * 78.233) * 43758.5453
    return CGFloat((x - x.rounded(.down) - 0.5) * 2)
  }

  static func nonZero(_ v: CGFloat) -> CGFloat { v > 0 ? v : 1 }
}

/// 길이 도구(l4Len · l4At · l4Slice · l4Nrm)
struct Polyline {
  let p: [CGPoint]
  let c: [CGFloat]

  init(_ p: [CGPoint]) {
    self.p = p
    var c: [CGFloat] = p.isEmpty ? [] : [0]
    for i in p.indices.dropFirst() {
      c.append(c[i - 1] + hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y))
    }
    self.c = c
  }

  var length: CGFloat { c.last ?? 0 }

  func at(_ length: CGFloat) -> CGPoint {
    guard p.count > 1 else { return p.first ?? .zero }
    let L = max(0, min(self.length, length))
    for i in 1..<p.count where c[i] >= L {
      let f = (L - c[i - 1]) / RouteMath.nonZero(c[i] - c[i - 1])
      return CGPoint(x: p[i - 1].x + (p[i].x - p[i - 1].x) * f, y: p[i - 1].y + (p[i].y - p[i - 1].y) * f)
    }
    return p[p.count - 1]
  }

  func slice(_ a: CGFloat, _ b: CGFloat) -> [CGPoint] {
    var out = [at(a)]
    for i in p.indices where c[i] > a && c[i] < b { out.append(p[i]) }
    out.append(at(b))
    return out
  }

  func normal(at L: CGFloat) -> CGPoint {
    let a = at(L - 1.5), b = at(L + 1.5)
    let dx = b.x - a.x, dy = b.y - a.y, n = RouteMath.nonZero(hypot(dx, dy))
    return CGPoint(x: -dy / n, y: dx / n)
  }

  /// 길이 L 이상인 첫 점의 번호(원근 배율을 고를 때)
  func index(atOrAfter L: CGFloat) -> Int {
    var i = 0
    while i < c.count - 1 && c[i] < L { i += 1 }
    return i
  }
}

/// 그릴 것 하나. 아래에서 위로 쌓는 순서대로 담는다
enum RouteMark {
  case stroke(Path, Color, CGFloat, CGLineCap)
  case fill(Path, Color)
  case ring(CGPoint, CGFloat, Color, CGFloat)
  /// 타원 그라데이션(가운데 → 가장자리). 빛 머리 번짐 · 빛 공기
  case glow(CGRect, Gradient)
  /// 세로 그라데이션 막대(아래 → 위). 빛 기둥
  case pillar(CGRect, Gradient)
}

struct RouteStyle {
  /// 선 몸 굵기 b
  var body: CGFloat
  var paused: Bool
  /// 격자 위면 선 아래 격자를 지운다(0층)
  var knock = true
  /// 빛 가루 0 없음 · 1 옅게 · 2 진하게
  var dust = 0
  /// 빛 머리 번짐 반지름 · 세로 비율(판에 눕히면 0.45)
  var bloom: CGFloat = 16
  var flat: CGFloat = 1
  /// 머리 크기 배율(아일랜드 미니 0.45)
  var headScale: CGFloat = 1
  var showStart = true
  /// 다 채운 km 수 · 거리(km). km 빛 알갱이 자리 = 경로 길이 × km / 거리(근사)
  var kmDone = 0
  var distanceKm: Double = 0
  /// 격자 지우기 · 출발 표시 속 색(잠금화면 tint, 아일랜드 검정)
  var tint: Color = LiveColor.tint
  /// 격자 지우기 굵기에 곱할 배율(원근 판을 줄여 그릴 때)
  var knockScale: CGFloat = 1
}

enum RouteArt {
  /// 선 쌓기(l4Route). p = 매끈한 화면 점, zs = 점마다 원근 배율(평평하면 nil)
  static func marks(_ p: [CGPoint], zs: [CGFloat]? = nil, style o: RouteStyle) -> [RouteMark] {
    guard !p.isEmpty else { return [] }
    let line = Polyline(p)
    let T = line.length, b0 = o.body, paused = o.paused
    let zAt: (CGFloat) -> CGFloat = { L in
      guard let zs = zs, !zs.isEmpty else { return 1 }
      return zs[min(zs.count - 1, line.index(atOrAfter: L))]
    }
    var out: [RouteMark] = []
    let outerW = min(14, b0 * 5), innerW = b0 * 2.4
    let ramp: (CGFloat, CGFloat) -> CGFloat = { t, full in min(1, t / full) }

    if T > 0 {
      // 0 격자 지우기
      if o.knock {
        out.append(.stroke(path(p), o.tint.opacity(0.9), (innerW + 3) * o.knockScale, .round))
      }
      // 길이 방향 띠 8개: 오래된 쪽 옅게, 지금 쪽 밝게. 띠 사이는 맞댄 끝이라 반투명이 겹치지 않는다
      let n = 8
      let bands: [(path: Path, t: CGFloat, z: CGFloat)] = (0..<n).map { b in
        let a0 = T * CGFloat(b) / CGFloat(n), a1 = T * CGFloat(b + 1) / CGFloat(n)
        return (path(line.slice(a0, a1)), (CGFloat(b) + 0.5) / CGFloat(n), zAt((a0 + a1) / 2))
      }
      // 1 바깥 빛(Signal Blue)
      for k in bands {
        let op: CGFloat = (paused ? 0.06 : 0.14) * (0.25 + 0.75 * ramp(k.t, 0.75))
        out.append(.stroke(k.path, LiveColor.signal.opacity(op), outerW * k.z, .butt))
      }
      // 2 안쪽 빛(Ice)
      for k in bands {
        let op: CGFloat = (paused ? 0.16 : 0.30) * (0.25 + 0.75 * ramp(k.t, 0.75))
        out.append(.stroke(k.path, LiveColor.ice.opacity(op), innerW * k.z, .butt))
      }
      // 3 선 몸(Ice): 첫 30% 길이는 0.75b → b, 불투명도 0.55 → 1
      for k in bands {
        let op: CGFloat = 0.55 + 0.45 * ramp(k.t, 0.7)
        let w: CGFloat = b0 * k.z * (0.75 + 0.25 * ramp(k.t, 0.3))
        out.append(.stroke(k.path, LiveColor.ice.opacity(op), w, .butt))
      }
    }
    // 출발 끝 둥글게
    out.append(.fill(circle(p[0], b0 * 0.75 * zAt(0) / 2), LiveColor.ice.opacity(0.55)))
    // 4 속선(꼬리 빛): 마지막 30 pt, 뒤쪽 0.15 → 머리 0.85
    if !paused, T > 0 {
      let tl = min(T, 30 * zAt(T)), k2 = 6
      for j in 0..<k2 {
        let a = T - tl + tl * CGFloat(j) / CGFloat(k2), b = T - tl + tl * CGFloat(j + 1) / CGFloat(k2)
        out.append(.stroke(path(line.slice(a, b)), LiveColor.text.opacity(0.15 + 0.7 * Double(j + 1) / Double(k2)), b0 * 0.45 * zAt(T), .butt))
      }
    }
    // 5 빛 가루(C 점 구름 → 선 둘레 가루). 불투명도가 길이에 따라 오르니 칸 10개로 묶어 Path 10개로 그린다
    if o.dust > 0, T > 0 {
      let d2 = o.dust == 2
      let bins = 10
      var dustPaths = [Path](repeating: Path(), count: bins)
      var used = [Bool](repeating: false, count: bins)
      var idx = 0
      var L = T * 0.06
      while L < T {
        let t2 = L / T, q = line.at(L), nn = line.normal(at: L), z2 = zAt(L)
        for _ in 0..<(t2 > 0.7 ? 2 : 1) {
          let spread: CGFloat = d2 ? 3.6 : 2.6
          let off: CGFloat = RouteMath.jitter(idx, 1) * (1 + spread * t2) * z2
          let al: CGFloat = RouteMath.jitter(idx, 2) * z2
          let center = CGPoint(x: q.x + nn.x * off - nn.y * al, y: q.y + nn.y * off + nn.x * al)
          let r0: CGFloat = d2 ? 0.7 : 0.55
          let r: CGFloat = (r0 + r0 * t2) * z2
          let bin = min(bins - 1, Int(t2 * CGFloat(bins)))
          dustPaths[bin].addEllipse(in: CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r))
          used[bin] = true
          idx += 1
        }
        let gap: CGFloat = d2 ? 2.0 : 2.4
        L += max(0.2, gap * zAt(L))
      }
      for b in 0..<bins where used[b] {
        let tc = (CGFloat(b) + 0.5) / CGFloat(bins)
        let base: CGFloat = d2 ? 0.2 : 0.14, rise: CGFloat = d2 ? 0.55 : 0.46
        let op: CGFloat = (base + rise * tc) * (paused ? 0.6 : 1)
        out.append(.fill(dustPaths[b], LiveColor.ice.opacity(op)))
      }
    }
    // 6 km 빛 알갱이: 선을 끊지 않는 작은 점. 12 km까지 1 km마다, 넘으면 5 km마다. 머리에서 10 안쪽은 뺌
    if o.kmDone > 0, o.distanceKm > 0, T > 0 {
      let step = o.distanceKm <= 12 ? 1 : 5
      var kmPath = Path()
      var any = false
      for km in stride(from: step, through: o.kmDone, by: step) {
        let Lk = T * CGFloat(Double(km) / o.distanceKm)
        if T - Lk < 10 { continue }
        kmPath.addEllipse(in: rect(line.at(Lk), 1.5 * zAt(Lk)))
        any = true
      }
      if any { out.append(.fill(kmPath, LiveColor.text.opacity(0.85))) }
    }
    // 7 출발 표시: 조용하게(속 tint, 테 Ice 0.55)
    if o.showStart {
      let r = 2.6 * zAt(0)
      out.append(.fill(circle(p[0], r), o.tint))
      out.append(.ring(p[0], r, LiveColor.ice.opacity(0.55), 1.2))
    }
    // 8 지금 위치
    let h = p[p.count - 1], zh = zAt(T), hs = o.headScale
    if paused {
      out.append(.ring(h, 5 * zh * hs, LiveColor.warn.opacity(0.8), 1.2 * max(hs, 0.7)))
      out.append(.fill(circle(h, 2.8 * zh * hs), LiveColor.warn))
      return out
    }
    let R = o.bloom * zh
    out.append(.glow(
      CGRect(x: h.x - R, y: h.y - R * o.flat, width: 2 * R, height: 2 * R * o.flat),
      Gradient(stops: [
        .init(color: LiveColor.ice.opacity(0.55), location: 0),
        .init(color: LiveColor.signal.opacity(0.16), location: 0.45),
        .init(color: LiveColor.signal.opacity(0), location: 1),
      ])
    ))
    if hs >= 0.8 { out.append(.ring(h, 5.2 * zh, LiveColor.ice.opacity(0.8), 1.2)) }
    out.append(.fill(circle(h, 2.8 * zh * hs), LiveColor.text))
    return out
  }

  static func path(_ pts: [CGPoint]) -> Path {
    var path = Path()
    guard let first = pts.first else { return path }
    path.move(to: first)
    path.addLines(Array(pts.dropFirst()))
    return path
  }

  static func rect(_ c: CGPoint, _ r: CGFloat) -> CGRect {
    CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)
  }

  static func circle(_ c: CGPoint, _ r: CGFloat) -> Path {
    Path(ellipseIn: rect(c, r))
  }
}

/// 쌓은 것을 그대로 그린다. 좌표는 이 뷰의 왼쪽 위 기준(부모가 크기를 준다)
struct RouteMarksView: View {
  let marks: [RouteMark]

  var body: some View {
    ZStack(alignment: .topLeading) {
      ForEach(marks.indices, id: \.self) { i in
        mark(marks[i])
      }
    }
  }

  @ViewBuilder
  private func mark(_ m: RouteMark) -> some View {
    switch m {
    case let .stroke(path, color, width, cap):
      path.stroke(color, style: StrokeStyle(lineWidth: width, lineCap: cap, lineJoin: .round))
    case let .fill(path, color):
      path.fill(color)
    case let .ring(center, r, color, width):
      RouteArt.circle(center, r).stroke(color, lineWidth: width)
    case let .glow(rect, gradient):
      Rectangle()
        .fill(EllipticalGradient(gradient: gradient, center: .center, startRadiusFraction: 0, endRadiusFraction: 0.5))
        .frame(width: rect.width, height: rect.height)
        .position(x: rect.midX, y: rect.midY)
    case let .pillar(rect, gradient):
      Rectangle()
        .fill(LinearGradient(gradient: gradient, startPoint: .bottom, endPoint: .top))
        .frame(width: rect.width, height: rect.height)
        .position(x: rect.midX, y: rect.midY)
    }
  }
}

/// 다이내믹 아일랜드 미니 경로(축소형 앞 26 × 20 · 최소형 22 × 22). 평평한 선 v2 축소판:
/// ε 0.5 · 모서리 3 / 1.5, 몸 1.3, 속선, 머리 속 1.26 + 번짐 5.5. 출발 · km · 가루 · 머리 테 없음
struct MiniRoute: View {
  let route: [Double]
  let paused: Bool
  let size: CGSize

  var body: some View {
    let raw = RouteMath.points(route)
    let fitted = RouteMath.fit(raw, into: CGRect(x: 1, y: 1, width: size.width - 2, height: size.height - 2))
    let p = RouteMath.smooth(fitted, eps: 0.5, r1: 3, r2: 1.5)
    let style = RouteStyle(body: 1.3, paused: paused, knock: false, dust: 0, bloom: 5.5, headScale: 0.45, showStart: false, tint: LiveColor.island)
    RouteMarksView(marks: RouteArt.marks(p, style: style))
      .frame(width: size.width, height: size.height)
  }
}
