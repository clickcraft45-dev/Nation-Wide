import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CountryDto } from "@nationwide/shared-types";
import { DestinationStep } from "./destination-step";

const COUNTRIES = [
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
].map((c) => ({ ...c, id: c.code, isActive: true }) as CountryDto);

async function typeThenContinue(text: string) {
  const onContinue = vi.fn();
  render(<DestinationStep countries={COUNTRIES} isLoading={false} onContinue={onContinue} />);
  await userEvent.type(screen.getByLabelText("Search destination country"), text);
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  return onContinue;
}

describe("DestinationStep", () => {
  it("takes a country typed in full without a click on the list", async () => {
    expect(await typeThenContinue("United States")).toHaveBeenCalledWith(COUNTRIES[2]);
  });

  it("still asks for a pick when the text matches several countries", async () => {
    const onContinue = await typeThenContinue("united");
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText("Please select a destination country to continue.")).toBeInTheDocument();
  });
});
