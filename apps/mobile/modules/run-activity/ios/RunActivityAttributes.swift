import ActivityKit
import Foundation

// 잠금화면 위젯(targets/stride-live/RunActivityAttributes.swift)과 이름·필드가 같아야 한다.
// ActivityKit은 타입 이름과 Codable 모양으로 앱과 위젯의 Activity를 맞춘다 — 한쪽만 바꾸지 말 것.
@available(iOS 16.1, *)
struct RunActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// 지금까지 거리(km)
    var distanceKm: Double
    /// 평균 페이스(초/km). 0이면 아직 없음
    var paceSecPerKm: Double
    /// 일시정지를 뺀 경과 시간(초). 일시정지 중 표시용
    var elapsedSec: Double
    /// 경과 시간 기준 시작 시각(시작 + 일시정지 합). 잠금화면에서 시간이 스스로 흐르게 한다
    var timerStart: Date
    var paused: Bool
    /// 경로 점 구름: 0~1로 맞춘 x0, y0, x1, y1 … (최대 48점)
    var route: [Double]
  }

  /// 「RUN/0427」 — 내 n번째 러닝
  var runNo: String
}
