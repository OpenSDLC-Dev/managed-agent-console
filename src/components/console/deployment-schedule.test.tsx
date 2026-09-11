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
  fireEvent.change(screen.getByLabelText("At"), { target: { value: "4:45" } });
  await userEvent.click(screen.getByRole("radio", { name: "PM" }));
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
  await userEvent.click(
    screen.getByRole("combobox", { name: "IANA timezone" }),
  );
  await userEvent.type(
    await screen.findByRole("combobox", { name: "Search timezones" }),
    "Shanghai",
  );
  await userEvent.click(
    await screen.findByRole("option", { name: /Asia\/Shanghai$/ }),
  );
  expect(timezone).toHaveBeenLastCalledWith("Asia/Shanghai");
}, 10_000);

it.each([
  ["0 0 * * *", "12:00", "AM", "0 12 * * *"],
  ["0 12 * * *", "12:00", "PM", "0 0 * * *"],
  ["59 23 * * *", "11:59", "PM", "59 11 * * *"],
])(
  "preserves %s and switches its period without changing minutes",
  async (cron, time, period, changed) => {
    const onChange = vi.fn();
    render(
      <DeploymentSchedule
        expression={cron}
        timezone="UTC"
        onExpressionChange={onChange}
        onTimezoneChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("At")).toHaveValue(time);
    expect(screen.getByRole("radio", { name: period })).toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("radio", { name: period === "AM" ? "PM" : "AM" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(changed);
    fireEvent.change(screen.getByLabelText("At"), {
      target: { value: "13:00" },
    });
    expect(screen.getByLabelText("At")).toBeInvalid();
    expect(onChange).toHaveBeenLastCalledWith("");
  },
);
