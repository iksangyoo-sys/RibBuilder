const XML_ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export function isXmlId(value: string): boolean {
  return XML_ID.test(value);
}

export function collectIds(ids: string[]): string[] {
  return ids.filter(Boolean);
}

export class IdIssuer {
  private used: Set<string>;
  private n: number;

  constructor(used: Iterable<string> = [], start = 1) {
    this.used = new Set(used);
    this.n = start;
  }

  next(prefix: string): string {
    let id = `${prefix}_${this.n}`;
    while (this.used.has(id)) {
      this.n += 1;
      id = `${prefix}_${this.n}`;
    }
    this.used.add(id);
    this.n += 1;
    return id;
  }

  uid(): string {
    return this.next("u");
  }

  take(id: string): string {
    this.used.add(id);
    return id;
  }
}

export const PREFIX: Record<string, string> = {
  tab: "tab",
  group: "grp",
  button: "btn",
  toggleButton: "tgl",
  checkBox: "chk",
  editBox: "edt",
  comboBox: "cmb",
  dropDown: "dd",
  menu: "mnu",
  splitButton: "spl",
  labelControl: "lbl",
  separator: "sep",
  item: "itm",
  image: "img",
};
