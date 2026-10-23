import { cx } from "./ui";
export function Avatar({ id, name, hasPhoto, size = 48, selected, dark }: { id: string; name: string; hasPhoto: boolean; size?: number; selected?: boolean; dark?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  if (hasPhoto) return <img src={`/media/candidate/${id}`} alt="" width={size} height={size} className={cx("shrink-0 rounded-full object-cover", selected && "ring-2 ring-lime ring-offset-2")} style={{ width: size, height: size }} />;
  return <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full font-semibold", selected ? "bg-lime text-ink" : dark ? "bg-g800 text-g200" : "bg-g100 text-g600")} style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials}</span>;
}
