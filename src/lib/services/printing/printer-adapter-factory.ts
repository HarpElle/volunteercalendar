import type { PrinterType } from "@/lib/types";
import type { PrinterAdapter } from "./types";
import { BrotherQLAdapter } from "./brother-ql-adapter";
import { ZebraZDAdapter } from "./zebra-zd-adapter";
import { DymoAdapter } from "./dymo-adapter";

export function getPrinterAdapter(type: PrinterType): PrinterAdapter {
  switch (type) {
    case "brother_ql":
      return new BrotherQLAdapter();
    case "zebra_zd":
      return new ZebraZDAdapter();
    case "dymo_labelwriter":
      return new DymoAdapter();
    default:
      throw new Error(`Unsupported printer type: ${type}`);
  }
}
