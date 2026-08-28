export class FurnitureSeatSelection {
  private selected: string | undefined;

  public constructor(selected?: string) {
    this.selected = selected;
  }

  public get value(): string | undefined {
    return this.selected;
  }

  public restore(availableSeats: Iterable<string>): string {
    const selected = this.selected;
    if (!selected) return "";
    const seats = [...availableSeats];
    if (seats.includes(selected)) return selected;
    const path = this.path(selected);
    const matches = seats.filter((seat) => this.path(seat) === path);
    if (matches.length !== 1) return "";
    return matches[0] ?? "";
  }

  public select(selected: string): void {
    this.selected = selected;
  }

  private path(seat: string): string {
    const separator = seat.lastIndexOf(":");
    if (separator < 0) return seat;
    return seat.slice(0, separator);
  }
}
