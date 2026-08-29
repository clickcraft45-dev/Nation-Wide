import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Calendar, addDaysIso, toIso } from "./calendar";

describe("calendar date maths", () => {
  it("keeps ISO strings in local time", () => {
    // 25 Aug, 2026 at 00:30 local is still the 24th in UTC — toISOString() would post the wrong day.
    expect(toIso(new Date(2026, 7, 25, 0, 30))).toBe("2026-08-25");
  });

  it("walks across month and year boundaries", () => {
    expect(addDaysIso("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("<Calendar>", () => {
  it("renders six weeks starting on the Sunday before the first of the month", () => {
    render(<Calendar selected="2026-08-25" />);
    const cells = screen.getAllByRole("gridcell");
    expect(cells).toHaveLength(42);
    expect(cells[0]).toHaveAccessibleName(/26 Jul, 2026/);
    expect(cells[41]).toHaveAccessibleName(/5 Sept?, 2026/);
  });

  it("reports the clicked day and labels its marker count", async () => {
    const onSelect = vi.fn();
    render(
      <Calendar
        selected="2026-08-25"
        onSelect={onSelect}
        markers={{ "2026-08-27": 4 }}
        markerLabel="pickups"
      />,
    );

    await userEvent.click(screen.getByRole("gridcell", { name: /27 Aug, 2026, 4 pickups/ }));
    expect(onSelect).toHaveBeenCalledWith("2026-08-27");
  });

  it("disables days outside min/max", () => {
    render(<Calendar selected="2026-08-25" min="2026-08-20" max="2026-08-28" />);
    expect(screen.getByRole("gridcell", { name: /19 Aug, 2026/ })).toBeDisabled();
    expect(screen.getByRole("gridcell", { name: /20 Aug, 2026/ })).toBeEnabled();
    expect(screen.getByRole("gridcell", { name: /29 Aug, 2026/ })).toBeDisabled();
  });
});
