import XCTest
@testable import Trailmark

final class TrailmarkTests: XCTestCase {
    func testCountdownUsesElapsedTimeAndPreservesPause() {
        let start = Date(timeIntervalSince1970: 1000)
        var timer = Countdown(); timer.reset(minutes: 5); timer.start(at: start)
        XCTAssertEqual(timer.seconds(at: start.addingTimeInterval(70)), 230)
        timer.pause(at: start.addingTimeInterval(70))
        XCTAssertEqual(timer.seconds(at: start.addingTimeInterval(500)), 230)
        timer.start(at: start.addingTimeInterval(500))
        XCTAssertEqual(timer.seconds(at: start.addingTimeInterval(800)), 0)
    }
    func testMoonPhaseWrapsBeforeAndAfterEpoch() {
        for seconds in [-1000000000.0, 0, 947182440, 2000000000] {
            let phase = Astronomy.phase(at: Date(timeIntervalSince1970: seconds))
            XCTAssertGreaterThanOrEqual(phase, 0); XCTAssertLessThan(phase, 1)
        }
        XCTAssertEqual(Astronomy.phase(at: Date(timeIntervalSince1970: 947182440)), 0, accuracy: 0.0001)
    }
    func testFeedsParseCDATAAndRejectUnsafeLinks() {
        let xml = "<rss><channel><item><title><![CDATA[Hello & world]]></title><link>https://example.com/story</link></item><item><title>Unsafe</title><link>file:///etc/passwd</link></item></channel></rss>"
        let reader = FeedReader(); let parser = XMLParser(data: Data(xml.utf8)); parser.delegate = reader
        XCTAssertTrue(parser.parse()); XCTAssertEqual(reader.items.count, 2)
        XCTAssertEqual(reader.items[0].title, "Hello & world"); XCTAssertNotNil(reader.items[0].url); XCTAssertNil(reader.items[1].url)
    }
}
