import { simpleScheduleToCron } from "../simpleSchedule";

describe("simpleScheduleToCron", () => {
  it("every 5 minutes", () => {
    expect(simpleScheduleToCron(5, "minutes")).toBe("*/5 * * * *");
  });

  it("every 2 hours", () => {
    expect(simpleScheduleToCron(2, "hours")).toBe("0 */2 * * *");
  });

  it("every 1 day", () => {
    expect(simpleScheduleToCron(1, "days")).toBe("0 0 * * *");
  });

  it("every 1 minute collapses to a bare *", () => {
    expect(simpleScheduleToCron(1, "minutes")).toBe("* * * * *");
  });

  it("every 1 hour collapses to a bare * on the hour field", () => {
    expect(simpleScheduleToCron(1, "hours")).toBe("0 * * * *");
  });

  it("every 3 days", () => {
    expect(simpleScheduleToCron(3, "days")).toBe("0 0 */3 * *");
  });

  it("rejects a zero interval", () => {
    expect(() => simpleScheduleToCron(0, "minutes")).toThrow();
  });

  it("rejects a negative interval", () => {
    expect(() => simpleScheduleToCron(-1, "hours")).toThrow();
  });

  it("rejects a non-integer interval", () => {
    expect(() => simpleScheduleToCron(1.5, "days")).toThrow();
  });
});
