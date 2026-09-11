import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimezonePicker, timezoneOffset } from "./timezone-picker";
afterEach(cleanup);
it("searches suggestions, preserves exact custom values, and cancels without mutation", async () => {
  const change = vi.fn();
  const user = userEvent.setup();
  render(<TimezonePicker value="US/Eastern" onChange={change} />);
  const trigger = screen.getByRole("combobox", { name: "IANA timezone" });
  expect(trigger).toHaveTextContent("US/Eastern");
  await user.click(trigger);
  await user.type(
    await screen.findByRole("combobox", { name: "Search timezones" }),
    "Shanghai",
  );
  await user.keyboard("[Escape]");
  expect(change).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  const search = await screen.findByRole("combobox", {
    name: "Search timezones",
  });
  await user.clear(search);
  await user.type(search, "Custom/ServerZone");
  await user.click(
    await screen.findByRole("option", { name: "Custom/ServerZone" }),
  );
  expect(change).toHaveBeenCalledWith("Custom/ServerZone");
}, 10_000);

it("formats UTC, fractional offsets and seasonal daylight saving without rejecting aliases", () => {
  const winter = new Date("2026-01-01T12:00:00Z");
  const summer = new Date("2026-07-01T12:00:00Z");
  expect(timezoneOffset("UTC", winter)).toBe("GMT+00:00");
  expect(timezoneOffset("Asia/Kathmandu", winter)).toBe("GMT+05:45");
  expect(timezoneOffset("America/New_York", winter)).toBe("GMT-05:00");
  expect(timezoneOffset("America/New_York", summer)).toBe("GMT-04:00");
  expect(timezoneOffset("Server/Custom", summer)).toBeUndefined();
});
