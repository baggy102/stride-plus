// 잠금화면·다이내믹 아일랜드 Live Activity(기록 중 러닝). @bacons/apple-targets가 prebuild 때 위젯 확장으로 만든다
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'StrideLive',
  displayName: 'Stride+ 러닝',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  bundleIdentifier: '.live',
};
