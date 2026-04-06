interface FontSizeTagProps {
  label: string;
}

export function FontSizeTag({ label }: FontSizeTagProps) {
  return <span className="font-size-tag">{label}</span>;
}
