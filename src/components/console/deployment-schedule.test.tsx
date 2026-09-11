import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeploymentSchedule, scheduleDraft } from "./deployment-schedule";
afterEach(cleanup);

it.each([
  ["* * * * *", "Every minute"],
  ["15 * * * *", "Every hour"],
  ["30 9 * * *", "Daily"],
  ["0 9 * * 1-5", "Weekdays"],
  ["0 9 * * 6", "Weekly"],
  ["*/5 * * * *", "Custom cron"],
  ["0 0 29 2 *", "Custom cron"],
  ["0 9 * * 7", "Custom cron"],
  ["0 0 0 * * *", "Custom cron"],
  ["", "Custom cron"],
  ["60 9 * * *", "Custom cron"],
  ["0 24 * * *", "Custom cron"],
])("recognizes %s without rewriting it", (expression, frequency) => {
  expect(scheduleDraft(expression).frequency).toBe(frequency);
});

it("translates frequency controls to five-field cron and leaves custom input untouched", async () => {
  const expression = vi.fn(),
    timezone = vi.fn();
  render(
    <DeploymentSchedule
      expression="0 9 * * 1-5"
      timezone="UTC"
      onExpressionChange={expression}
      onTimezoneChange={timezone}
    />,
  );
  expect(expression).not.toHaveBeenCalled();
  await userEvent.selectOptions(
    screen.getByLabelText("Frequency"),
    "Every minute",
  );
  expect(expression).toHaveBeenLastCalledWith("* * * * *");
  await userEvent.selectOptions(
    screen.getByLabelText("Frequency"),
    "Every hour",
  );
  fireEvent.change(screen.getByLabelText("At minute"), {
    target: { value: "25" },
  });
  expect(expression).toHaveBeenLastCalledWith("25 * * * *");
  await userEvent.selectOptions(screen.getByLabelText("Frequency"), "Daily");
  fireEvent.change(screen.getByLabelText("At"), { target: { value: "16:45" } });
  expect(expression).toHaveBeenLastCalledWith("45 16 * * *");
  await userEvent.selectOptions(screen.getByLabelText("Frequency"), "Weekly");
  await userEvent.selectOptions(screen.getByLabelText("On"), "6");
  expect(expression).toHaveBeenLastCalledWith("45 16 * * 6");
  await userEvent.selectOptions(screen.getByLabelText("Frequency"), "Weekdays");
  expect(expression).toHaveBeenLastCalledWith("45 16 * * 1-5");
  expression.mockClear();
  await userEvent.click(screen.getByRole("button", { name: "Edit cron" }));
  expect(expression).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Cron expression")).toHaveValue("0 9 * * 1-5");
  fireEvent.change(screen.getByLabelText("Cron expression"), {
    target: { value: "0 0 29 2 *" },
  });
  expect(expression).toHaveBeenLastCalledWith("0 0 29 2 *");
  fireEvent.change(screen.getByLabelText("IANA timezone"), {
    target: { value: "Asia/Shanghai" },
  });
  expect(timezone).toHaveBeenLastCalledWith("Asia/Shanghai");
});
