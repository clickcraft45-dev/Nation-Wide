import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(
      <Pagination page={1} pageSize={25} total={10} onPageChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the correct range and page count", () => {
    render(<Pagination page={2} pageSize={25} total={81} onPageChange={vi.fn()} />);
    expect(screen.getByText("Showing 26–50 of 81")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
  });

  it("disables Previous on the first page and Next on the last page", () => {
    const { rerender } = render(
      <Pagination page={1} pageSize={25} total={81} onPageChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).toBeEnabled();

    rerender(<Pagination page={4} pageSize={25} total={81} onPageChange={vi.fn()} />);
    expect(screen.getByLabelText("Previous page")).toBeEnabled();
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("calls onPageChange with page +/- 1 when the buttons are clicked", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={25} total={81} onPageChange={onPageChange} />);

    await user.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByLabelText("Previous page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("clamps the range end to total on the last (partial) page", () => {
    render(<Pagination page={4} pageSize={25} total={81} onPageChange={vi.fn()} />);
    expect(screen.getByText("Showing 76–81 of 81")).toBeInTheDocument();
  });
});
