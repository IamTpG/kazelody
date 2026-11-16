type Option = { id: string; label: string }

type Props = {
  options: Option[]
  selected: number
  onSelect: (index: number) => void
}

export function Overlay({ options, selected, onSelect }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 text-white sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-wide drop-shadow-[0_2px_8px_rgba(40,40,90,0.45)] sm:text-3xl">
          KazeLody
          <span className="ml-2 align-middle text-sm font-medium opacity-80">風 · melody</span>
        </h1>
      </header>

      <footer className="flex flex-col items-center gap-3">
        <div className="pointer-events-auto flex flex-wrap justify-center gap-1 rounded-full border border-white/30 bg-white/15 p-1 shadow-lg backdrop-blur-md">
          {options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(i)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                i === selected ? 'bg-white/85 text-indigo-900' : 'text-white hover:bg-white/20'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium opacity-85 drop-shadow-[0_1px_4px_rgba(40,40,90,0.6)]">
          Lướt chuột qua cỏ để tạo gió · Nhấp chuột để gọi một cơn gió
        </p>
      </footer>
    </div>
  )
}
