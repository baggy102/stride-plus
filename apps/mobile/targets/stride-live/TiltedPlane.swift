import SwiftUI

// CG-3 「기운 판」(SPEC_LA4 7절): 24 간격 격자 판을 원근으로 눕히고 그 위에 경로 선 v2를 놓는다.
// 3D 변환 없이 판 좌표(X 0~PW, Z 0~PD, Z = 0이 먼 쪽)를 코드로 투영해 2D Path로 그린다(l4Plane · l4PlaneGrid).
// 가까운 쪽 배율 1, 먼 쪽 1/(1+k). 판의 가까운 끝은 카드 오른쪽 밖까지 이어지고 카드 모양에서 잘린다(틀 깨기).

struct PlaneSpec {
  /// 판 크기(판 단위)와 원근 세기
  var planeWidth: CGFloat
  var planeDepth: CGFloat
  var k: CGFloat
  /// 판 가로 가운데 x, 가까운 끝 y, 먼 끝 y(그리는 칸 좌표)
  var cx: CGFloat
  var yNear: CGFloat
  var yFar: CGFloat
  /// 판 위 경로 맞춤 상자(비율 그대로, 판 위에서 매끈하게 한 뒤 점마다 투영)
  var fit: CGRect
  /// 선 몸 굵기(× 원근 배율) · 빛 머리 번짐 반지름 · 빛 기둥 높이
  var body: CGFloat
  var bloom: CGFloat
  var pillar: CGFloat
  /// 빛 공기(빛 머리 중심 타원 반지름) · 빛 둘레 격자 반경
  var wash: CGSize
  var lit: CGFloat
  /// 격자 가로 흐림: 칸 폭 비율 fadeFrom까지 0 → fadeTo에서 1(수치 기둥 뒤에서 사라지게)
  var fadeFrom: CGFloat
  var fadeTo: CGFloat
  /// 격자 지우기 · 출발 표시 속 색
  var tint: Color
  /// 전체를 줄여 그릴 때 배율과 원점(아일랜드 칸이 좁을 때). 잠금화면은 1 · 0
  var scale: CGFloat = 1
  var origin: CGPoint = .zero

  static let gridStep: CGFloat = 24
  static let gridOpacity = 0.08
  static let litOpacity = 0.42
  static let washOpacity = 0.14
  /// 빛 머리 번짐을 판에 눕힌 세로 비율
  static let flat: CGFloat = 0.45

  /// 잠금화면 카드(SPEC_LA4 7-2). 362 폭에서 cx 238, 371 폭에서 247 → 카드 오른쪽에서 124 안쪽
  static func lock(width: CGFloat) -> PlaneSpec {
    PlaneSpec(
      planeWidth: 270, planeDepth: 230, k: 0.8,
      cx: width - 124, yNear: 156, yFar: 16,
      fit: CGRect(x: 36, y: 14, width: 200, height: 204),
      body: 3.4, bloom: 26, pillar: 34,
      wash: CGSize(width: 110, height: 50), lit: 64,
      fadeFrom: 0.42, fadeTo: 0.52,
      tint: LiveColor.tint
    )
  }

  /// 아일랜드 펼친 모습 오른쪽 칸(SPEC_LA4 7-4: PW 240 · PD 200 · k 0.8, 맞춤 X 30–210 × Z 12–190, 몸 3.0, 기둥 30).
  /// 212 × 132 설계 칸을 칸 오른쪽 아래에 맞추고, 칸이 더 좁으면 통째로 줄인다
  static func island(size: CGSize) -> PlaneSpec {
    let design = CGSize(width: 212, height: 132)
    let u = min(1, size.width / design.width, size.height / design.height)
    return PlaneSpec(
      planeWidth: 240, planeDepth: 200, k: 0.8,
      cx: 107, yNear: 128, yFar: 0,
      fit: CGRect(x: 30, y: 12, width: 180, height: 178),
      body: 3.0, bloom: 22, pillar: 30,
      wash: CGSize(width: 96, height: 44), lit: 56,
      fadeFrom: 0, fadeTo: 0.25,
      tint: LiveColor.island,
      scale: u,
      origin: CGPoint(x: size.width - design.width * u, y: size.height - design.height * u)
    )
  }

  /// 판 위 점 → 칸 좌표와 그 자리의 배율
  func project(_ q: CGPoint) -> (pt: CGPoint, z: CGFloat) {
    let yh = (yFar * (1 + k) - yNear) / k
    let z = 1 + k * (1 - q.y / planeDepth)
    let x = cx + (q.x - planeWidth / 2) / z
    let y = yh + (yNear - yh) / z
    return (CGPoint(x: origin.x + x * scale, y: origin.y + y * scale), scale / z)
  }

  /// 판 위 24 간격 선을 투영한 격자(세로선은 한 점으로 모인다)
  func grid() -> Path {
    var p = Path()
    var i: CGFloat = 0
    while i <= planeWidth {
      p.move(to: project(CGPoint(x: i, y: 0)).pt)
      p.addLine(to: project(CGPoint(x: i, y: planeDepth)).pt)
      i += Self.gridStep
    }
    i = planeDepth
    while i >= 0 {
      p.move(to: project(CGPoint(x: 0, y: i)).pt)
      p.addLine(to: project(CGPoint(x: planeWidth, y: i)).pt)
      i -= Self.gridStep
    }
    return p
  }
}

/// 기운 판 + 경로 선 v2 + 빛 머리 · 기둥 · 공기. size = 그리는 칸(잠금화면은 카드 전체)
struct TiltedPlaneView: View {
  let route: [Double]
  let distanceKm: Double
  let paused: Bool
  let spec: PlaneSpec
  let size: CGSize

  var body: some View {
    // 칸 크기가 아직 0이면(첫 배치) 그리지 않는다. 배율 0으로 가루 간격이 0이 되는 것도 막는다
    if size.width >= 1, size.height >= 1, spec.scale > 0.05 {
      plane
    }
  }

  @ViewBuilder
  private var plane: some View {
    let onPlane = RouteMath.smooth(RouteMath.fit(RouteMath.points(route), into: spec.fit), eps: 1)
    let projected = onPlane.map { spec.project($0) }
    let p = projected.map { $0.pt }
    let zs = projected.map { $0.z }
    let style = RouteStyle(
      body: spec.body, paused: paused, knock: true, dust: 2,
      bloom: spec.bloom, flat: PlaneSpec.flat,
      kmDone: Int(max(0, distanceKm).rounded(.down)), distanceKm: distanceKm,
      tint: spec.tint, knockScale: spec.scale
    )
    let marks = RouteArt.marks(p, zs: zs, style: style)
    let head = p.last
    let zh = zs.last ?? spec.scale

    ZStack(alignment: .topLeading) {
      // 빛 공기: 빛 머리 둘레 카드 바탕에 Signal Blue를 아주 옅게(REC만)
      if !paused, let h = head {
        let w = spec.wash.width * spec.scale, hgt = spec.wash.height * spec.scale
        RouteMarksView(marks: [.glow(
          CGRect(x: h.x - w, y: h.y - hgt, width: 2 * w, height: 2 * hgt),
          Gradient(colors: [LiveColor.signal.opacity(PlaneSpec.washOpacity), LiveColor.signal.opacity(0)])
        )])
      }
      gridLayer(head: paused ? nil : head)
      RouteMarksView(marks: marks)
      // 빛 기둥: 머리에서 위로, Ice 0.65 → 0(REC만)
      if !paused, let h = head {
        let ph = spec.pillar * zh
        RouteMarksView(marks: [.pillar(
          CGRect(x: h.x - zh, y: h.y - ph, width: 2 * zh, height: ph),
          Gradient(colors: [LiveColor.ice.opacity(0.65), LiveColor.ice.opacity(0)])
        )])
      }
    }
    .frame(width: size.width, height: size.height, alignment: .topLeading)
  }

  /// 판 격자(0.08)와 빛 머리 둘레만 밝아지는 격자(0.42). 먼 쪽 · 왼쪽은 흐려진다
  private func gridLayer(head: CGPoint?) -> some View {
    let grid = spec.grid()
    return ZStack(alignment: .topLeading) {
      grid.stroke(LiveColor.ice.opacity(PlaneSpec.gridOpacity), lineWidth: 1)
      if let h = head, size.width > 0, size.height > 0 {
        grid.stroke(LiveColor.ice.opacity(PlaneSpec.litOpacity), lineWidth: 1)
          .mask {
            RadialGradient(
              gradient: Gradient(colors: [.white, .white.opacity(0)]),
              center: UnitPoint(x: h.x / size.width, y: h.y / size.height),
              startRadius: 0,
              endRadius: spec.lit * spec.scale
            )
          }
      }
    }
    .frame(width: size.width, height: size.height)
    .mask {
      LinearGradient(
        gradient: Gradient(stops: [
          .init(color: .white.opacity(0), location: 0),
          .init(color: .white.opacity(0), location: spec.fadeFrom),
          .init(color: .white, location: spec.fadeTo),
        ]),
        startPoint: .leading, endPoint: .trailing
      )
    }
    .mask {
      LinearGradient(
        gradient: Gradient(stops: [
          .init(color: .white.opacity(0), location: 0),
          .init(color: .white.opacity(0.7), location: 0.35),
          .init(color: .white, location: 1),
        ]),
        startPoint: .top, endPoint: .bottom
      )
    }
  }
}
