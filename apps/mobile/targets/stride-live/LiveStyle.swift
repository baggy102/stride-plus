import CoreText
import SwiftUI
import UIKit

// 잠금화면 Live Activity · 다이내믹 아일랜드 공통 색 · 글꼴 · 숫자 형식 · 자리 값(SPEC_LA4 CG-3 「기운 판」).
// 카드는 라이트 모드에서도 어두운 tint(#121922 0.92)라 색은 한 벌만 쓴다. 민트 · Pearl은 쓰지 않는다.

extension Color {
  init(rgb: UInt32, opacity: Double = 1) {
    self.init(
      .sRGB,
      red: Double((rgb >> 16) & 0xFF) / 255,
      green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255,
      opacity: opacity
    )
  }
}

enum LiveColor {
  /// Ice: 선 몸 · 안쪽 빛 · 빛 가루 · KM · 격자
  static let ice = Color(rgb: 0x9DBFE0)
  /// Signal Blue: 바깥 빛 · 빛 공기 · 머리 번짐 바깥쪽에만(불투명도 0.16 이하)
  static let signal = Color(rgb: 0x2E8BFF)
  /// 속선 · 머리 속 · km 빛 알갱이 · 큰 숫자(흰색 대신, Pearl과 헷갈리지 않게)
  static let text = Color(rgb: 0xDCE6EE)
  /// TIME · PACE 라벨
  static let text2 = Color(rgb: 0xAEBBC7)
  /// 워드마크 그림
  static let logo = Color(rgb: 0x4B83B5)
  /// 일시정지: PAUSED 라벨 · 머리
  static let warn = Color(rgb: 0xFFC66B)
  /// 카드 tint · 격자 지우기 · 출발 표시 속
  static let tint = Color(rgb: 0x121922)
  /// 카드 tint 불투명도(라이트 모드에서도 같음)
  static let tintOpacity = 0.92
  /// glassBorder 1px
  static let border = Color(rgb: 0xDCE6EE, opacity: 0.16)
  /// 다이내믹 아일랜드 바탕(시스템이 칠하는 검정). 아일랜드에서는 격자 지우기 · 출발 표시 속을 이 색으로
  static let island = Color(rgb: 0x000000)
}

// 위젯 확장에 넣은 글꼴(Fonts/, Info.plist UIAppFonts). 못 읽으면 시스템 글꼴로 대신한다.
enum LiveFont {
  /// 숫자: Barlow SemiBold(PostScript 이름)
  static let numName = "Barlow-SemiBold"
  /// 라벨: IBM Plex Mono Medium
  static let monoName = "IBMPlexMono-Medium"

  // UIAppFonts가 먼저 등록한다. 그래도 없으면(파일 자리 · plist 누락) 번들에서 찾아 한 번 직접 등록한다
  private static let available: (num: Bool, mono: Bool) = {
    let files: [(name: String, file: String)] = [
      (LiveFont.numName, "Barlow_600SemiBold"),
      (LiveFont.monoName, "IBMPlexMono_500Medium"),
    ]
    for f in files where UIFont(name: f.name, size: 12) == nil {
      let url = Bundle.main.url(forResource: f.file, withExtension: "ttf")
        ?? Bundle.main.url(forResource: f.file, withExtension: "ttf", subdirectory: "Fonts")
      if let url = url {
        _ = CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
      }
    }
    return (UIFont(name: LiveFont.numName, size: 12) != nil, UIFont(name: LiveFont.monoName, size: 12) != nil)
  }()

  /// Barlow SemiBold, 고정폭 숫자(tnum). 크기는 Dynamic Type을 따르지 않는다(카드 짜임이 pt로 정해져 있음)
  static func num(_ size: CGFloat) -> Font {
    available.num
      ? Font.custom(numName, fixedSize: size).monospacedDigit()
      : Font.system(size: size, weight: .semibold).monospacedDigit()
  }

  /// IBM Plex Mono Medium
  static func mono(_ size: CGFloat) -> Font {
    available.mono
      ? Font.custom(monoName, fixedSize: size)
      : Font.system(size: size, weight: .medium, design: .monospaced)
  }

  // 글꼴 치수(1 em 기준, fontTools로 읽은 값). 글자 윗선 맞춤 · 거리 크기 계산에 쓴다
  static let numCap: CGFloat = 0.700
  static let monoCap: CGFloat = 0.698
  /// Barlow tnum 숫자 폭 · 마침표 폭
  static let numDigitAdvance: CGFloat = 0.538
  static let numDotAdvance: CGFloat = 0.273
  /// Plex Mono 한 글자 폭
  static let monoAdvance: CGFloat = 0.600
}

enum LiveFormat {
  static func distance(_ km: Double) -> String {
    String(format: "%.2f", max(0, km))
  }

  static func pace(_ secPerKm: Double) -> String {
    guard secPerKm > 0, secPerKm.isFinite, secPerKm <= 3600 else { return "--'--\"" }
    let total = Int(secPerKm.rounded())
    return String(format: "%d'%02d\"", total / 60, total % 60)
  }

  /// 일시정지 중 멈춘 시간. 달릴 때 Text(.timer)와 같은 모양(분:초, 한 시간 넘으면 시:분:초)이라 글자 폭이 튀지 않는다
  static func elapsed(_ sec: Double) -> String {
    let total = max(0, Int(sec))
    let h = total / 3600, m = (total % 3600) / 60, s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
  }
}

// 잠금화면 카드 왼쪽 수치 기둥, L2 「균등 분배」(최종 리뷰 페이지 CG-3 표, 371 × 160 카드 기준).
// 위 워드마크 · 가운데 거리 · 아래 TIME / PACE 두 줄. Spacer 대신 고정 자리 값을 쓴다(Spacer는 줄 상자로 나눠 몇 pt 어긋남).
// 가로 자리는 기둥 왼쪽 끝(x 14) 기준이라 카드 폭이 달라도 그대로다. 세로 자리는 모두 글자 바닥선(baseline) 기준.
// 실기기에서 맞출 값이라 모두 여기 이름으로 둔다.
enum LockColumn {
  static let cardHeight: CGFloat = 160
  /// 기둥 왼쪽 x와 폭(x 14–140). PAUSED는 오른쪽 끝에 맞춘다
  static let x: CGFloat = 14
  static let width: CGFloat = 126
  /// 워드마크 윗변(y 16) · 마지막 줄 PACE 바닥선 아래(160 − 16 = 144)
  static let padTop: CGFloat = 16
  static let padBottom: CGFloat = 16

  /// 워드마크 그림 60 × 11.6(y 16–27.6)
  static let wordmarkWidth: CGFloat = 60
  static var wordmarkHeight: CGFloat { wordmarkWidth * WordmarkShape.aspect }

  /// PAUSED: IBM Plex Mono Medium 10.5, 자간 0.84, warn. 워드마크 줄(y 13.8–29.8)에서 오른쪽 끝 x 140
  static let pausedSize: CGFloat = 10.5
  static let pausedTracking: CGFloat = 0.84
  /// 줄 상자 13.8–29.8 안 바닥선 = 13.8 + (16 − 1.3 × 10.5) / 2 + 1.025 × 10.5
  static let pausedBaseline: CGFloat = 25.74

  /// 거리: Barlow SemiBold 46, 자간 −1.38(−0.03 em), 고정폭 숫자, 윗선 53.75 · 바닥선 85.95.
  /// KM: IBM Plex Mono Medium 11, 자간 1.32, 숫자 끝 + 5, 숫자 윗선에 맞춤.
  /// 12.34까지는 46 그대로, 6글자 이상(100.00)은 기둥 폭에 맞춰 줄고 바닥선은 그대로
  static let distance = DistanceStyle(size: 46, tracking: -1.38, kmSize: 11, kmTracking: 1.32, kmGap: 5, width: width)

  /// TIME · PACE 한 줄: 라벨 x 14 폭 30(Plex Mono Medium 10, 자간 1.4, text2) + 8 → 값 x 52 폭 62(Barlow SemiBold 17)
  static let labelSize: CGFloat = 10
  static let labelTracking: CGFloat = 1.4
  static let labelWidth: CGFloat = 30
  static let labelGap: CGFloat = 8
  static let valueSize: CGFloat = 17
  /// 값 칸 폭. 시안 표는 62지만 Text(.timer)가 가장 긴 모양(시:분:초) 폭을 잡아 잘리지 않게 기둥 오른쪽 끝(140)까지 준다
  static let valueWidth: CGFloat = 88
  /// TIME 바닥선 124 → PACE 바닥선 144
  static let linePitch: CGFloat = 20

  // 계산되는 자리
  static var paceBaseline: CGFloat { cardHeight - padBottom }
  static var timeBaseline: CGFloat { paceBaseline - linePitch }

  /// 거리 바닥선(85.95): 워드마크 아래(27.6)와 TIME 숫자 윗선(112.1) 사이 남는 높이를 위아래로 똑같이(26.15씩).
  /// 크기가 줄어도 46일 때 바닥선을 지킨다
  static var distanceBaseline: CGFloat {
    let top = padTop + wordmarkHeight
    let bottom = timeBaseline - valueSize * LiveFont.numCap
    return (top + bottom) / 2 + distance.size * LiveFont.numCap / 2
  }
}

// 다이내믹 아일랜드 펼친 모습 왼쪽 칸(SPEC_LA4 5-4 펼친 모습 기둥, 상태 줄 y 27–43 · 거리 바닥선 73.4 · TIME 100 · PACE 120을
// 상태 줄 가운데(35)에서 8 아래를 0으로 옮긴 값). 「● REC」 글자는 빼고 점만, 일시정지면 점 + PAUSED. 나눔 선 없음.
enum IslandColumn {
  static let width: CGFloat = 104
  static let height: CGFloat = 100
  /// 상태 점 6(달리는 중 Ice, 일시정지 warn) 가운데 y · PAUSED 글자(점 + 6)
  static let statusCenterY: CGFloat = 8
  static let dotSize: CGFloat = 6
  static let pausedSize: CGFloat = 10.5
  static let pausedTracking: CGFloat = 0.84
  static let pausedGap: CGFloat = 6
  /// 거리 Barlow SemiBold 32 + KM 10
  static let distance = DistanceStyle(size: 32, tracking: -0.96, kmSize: 10, kmTracking: 1.2, kmGap: 4, width: width)
  static let distanceBaseline: CGFloat = 46.4
  /// TIME · PACE: 라벨 x 0 · 값 x 38, 바닥선 73 · 93
  static let valueX: CGFloat = 38
  static let timeBaseline: CGFloat = 73
  static let paceBaseline: CGFloat = 93
  /// 오른쪽 칸 기운 판 높이(펼친 모습 상자 148 안)
  static let planeHeight: CGFloat = 132
  /// 축소형 앞 · 최소형 미니 경로
  static let compactRoute = CGSize(width: 26, height: 20)
  static let minimalRoute = CGSize(width: 22, height: 22)
  static let compactDistanceSize: CGFloat = 15
}

/// 큰 거리 숫자 + KM(숫자 윗선에 맞춘 모노 라벨)
struct DistanceStyle {
  var size: CGFloat
  /// 자간(pt, size 기준). 크기가 줄면 같은 비율로 준다
  var tracking: CGFloat
  var kmSize: CGFloat
  var kmTracking: CGFloat
  /// 숫자 끝 → KM
  var kmGap: CGFloat
  /// 숫자 + KM이 들어갈 폭
  var width: CGFloat
  /// 시스템 글꼴로 대신할 때(글자 폭이 달라) 마지막으로 받치는 하한
  var minScale: CGFloat = 0.6

  /// 폭에 KM까지 들어가는 크기(Barlow tnum 폭으로 계산, size가 상한)
  func fontSize(for text: String) -> CGFloat {
    let kmWidth = 2 * (LiveFont.monoAdvance * kmSize + kmTracking)
    let room = width - kmGap - kmWidth
    let trackingEm = tracking / size
    var em: CGFloat = 0
    for ch in text {
      em += (ch == "." ? LiveFont.numDotAdvance : LiveFont.numDigitAdvance) + trackingEm
    }
    guard em > 0 else { return size }
    return min(size, (room / em * 10).rounded(.down) / 10)
  }

  /// 한 줄 Text: 숫자(text) + KM(Ice). 마지막 숫자 뒤 자간으로 KM 간격을 만들고, KM은 바닥선을 올려 숫자 윗선에 맞춘다.
  /// 바닥선은 숫자 바닥선 하나라 pinned(baseline:)으로 둔다
  func text(_ value: String) -> some View {
    let s = fontSize(for: value)
    let t = tracking * s / size
    let num = LiveFont.num(s)
    let digits = Text(String(value.dropLast())).font(num).tracking(t)
      + Text(String(value.suffix(1))).font(num).tracking(t + kmGap)
    let km = Text("KM").font(LiveFont.mono(kmSize)).tracking(kmTracking)
      .foregroundColor(LiveColor.ice)
      .baselineOffset(s * LiveFont.numCap - kmSize * LiveFont.monoCap)
    return (digits.foregroundColor(LiveColor.text) + km)
      .lineLimit(1)
      .minimumScaleFactor(minScale)
      .frame(width: width, alignment: .leading)
  }
}

extension View {
  /// 카드(size) 안에서 글자 바닥선이 y, 왼쪽 끝이 x에 오게 둔다
  func pinned(x: CGFloat, baseline y: CGFloat, in size: CGSize) -> some View {
    alignmentGuide(.top) { $0[.firstTextBaseline] }
      .frame(width: size.width, height: size.height, alignment: .topLeading)
      .offset(x: x, y: y)
  }

  /// 카드(size) 안에서 글자 바닥선이 y, 오른쪽 끝이 right에 오게 둔다
  func pinned(right: CGFloat, baseline y: CGFloat, in size: CGSize) -> some View {
    alignmentGuide(.top) { $0[.firstTextBaseline] }
      .frame(width: size.width, height: size.height, alignment: .topTrailing)
      .offset(x: right - size.width, y: y)
  }

  /// 카드(size) 안에서 왼쪽 위 모서리가 (x, y)에 오게 둔다(그림용)
  func pinned(x: CGFloat, top y: CGFloat, in size: CGSize) -> some View {
    frame(width: size.width, height: size.height, alignment: .topLeading)
      .offset(x: x, y: y)
  }
}
