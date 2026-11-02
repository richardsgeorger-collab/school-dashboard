import XCTest

/// The Simulator driver (Loop 308). One run does one list of taps, from environment variables that xcodebuild passes
/// as TEST_RUNNER_<NAME>:
///   APP   settings | safari (default settings)
///   TAPS  labels to tap in order, separated by ">". "switch:Label=on" sets a switch; "type:text" types into the
///         focused field; "url:https://…" opens a page in Safari; "wait:2" waits two seconds.
/// It then prints what is on screen (buttons, switches, cells, text) between LIST>>> and <<<LIST for the bench to read.
final class Driver: XCTestCase {
  let env = ProcessInfo.processInfo.environment

  func app() -> XCUIApplication {
    XCUIApplication(bundleIdentifier: env["APP"] == "safari" ? "com.apple.mobilesafari" : "com.apple.Preferences")
  }

  func find(_ a: XCUIApplication, _ label: String) -> XCUIElement? {
    let p = NSPredicate(format: "label == %@ OR identifier == %@", label, label)
    let pBegins = NSPredicate(format: "label BEGINSWITH %@", label)
    for q in [a.buttons, a.cells, a.switches, a.staticTexts, a.links, a.otherElements, a.textFields] {
      let e = q.matching(p).firstMatch
      if e.exists && e.isHittable { return e }
    }
    for q in [a.buttons, a.cells, a.staticTexts] {
      let e = q.matching(pBegins).firstMatch
      if e.exists && e.isHittable { return e }
    }
    return nil
  }

  func reach(_ a: XCUIApplication, _ label: String) -> XCUIElement? {
    for i in 0..<10 {
      if let e = find(a, label) { return e }
      if i == 0 { sleep(1); continue }
      a.swipeUp()
    }
    for _ in 0..<10 {
      if let e = find(a, label) { return e }
      a.swipeDown()
    }
    return nil
  }

  func list(_ a: XCUIApplication) {
    var out: [String] = []
    let kinds: [(String, XCUIElementQuery)] = [("button", a.buttons), ("switch", a.switches), ("cell", a.cells), ("text", a.staticTexts), ("link", a.links), ("field", a.textFields)]
    for (k, q) in kinds {
      for e in q.allElementsBoundByIndex.prefix(150) where e.exists {
        let v = (e.value as? String).map { " = \($0)" } ?? ""
        let l = e.label.isEmpty ? e.identifier : e.label
        if l.isEmpty { continue }
        out.append("\(k): \(l)\(v)")
      }
    }
    print("LIST>>>\n\(out.joined(separator: "\n"))\n<<<LIST")
  }

  func testStep() throws {
    continueAfterFailure = false
    let a = app()
    if env["FRESH"] == "1" { a.terminate(); a.launch() } else { a.activate() }
    let taps = (env["TAPS"] ?? "").split(separator: ">").map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    for t in taps {
      if t.hasPrefix("wait:") { sleep(UInt32(t.dropFirst(5)) ?? 1); continue }
      if t.hasPrefix("type:") { a.typeText(String(t.dropFirst(5))); continue }
      if t.hasPrefix("url:") {
        let url = String(t.dropFirst(4))
        let bar = a.textFields.firstMatch.exists ? a.textFields.firstMatch : a.buttons["TabBarItemTitle"]
        bar.tap()
        a.typeText(url + "\n")
        sleep(2)
        continue
      }
      if t.hasPrefix("switch:") {
        let parts = t.dropFirst(7).split(separator: "=")
        let label = String(parts[0])
        let want = parts.count > 1 ? String(parts[1]) : "on"
        _ = reach(a, label)
        let e = a.switches.matching(NSPredicate(format: "label == %@", label)).firstMatch
        guard e.exists else { list(a); XCTFail("no switch \(label)"); return }
        if (want == "on") != ((e.value as? String) == "1") {
          // The toggle itself sits at the right end of its row.
          e.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
          sleep(1)
        }
        continue
      }
      guard let e = reach(a, t) else { list(a); XCTFail("nothing called \(t)"); return }
      e.tap()
      sleep(1)
    }
    sleep(1)
    list(a)
  }
}
