import { beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NativeSelect } from "./select";

function Controlled({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <NativeSelect
      aria-label="Status"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
    >
      <option value="">All statuses</option>
      {["PENDING", "PAID"].map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </NativeSelect>
  );
}

describe("<NativeSelect>", () => {
  // jsdom has no layout, so no scrollIntoView; every real browser does.
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("fires a real change event with the picked value", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.pointer({ keys: "[MouseLeft>]", target: screen.getByRole("option", { name: "PAID" }) });

    expect(onChange).toHaveBeenCalledWith("PAID");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveTextContent("PAID");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("picks with the keyboard", async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);

    screen.getByRole("combobox", { name: "Status" }).focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("PENDING");
  });
});
