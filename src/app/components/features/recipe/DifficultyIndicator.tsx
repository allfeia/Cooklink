interface DifficultyIndicatorProps {
  level: 1 | 2 | 3 | 4 | 5;
}

export function DifficultyIndicator({ level }: DifficultyIndicatorProps) {
  const colors = [
    "#22c55e", // зеленый для 1
    "#84cc16", // светло-зеленый для 2
    "#eab308", // желтый для 3
    "#f97316", // оранжевый для 4
    "#ef4444", // красный для 5
  ];

  return (
    <div className="flex items-center gap-1" aria-label={`Сложность: ${level} из 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="w-2.5 h-2.5 rounded-full border-2 transition-all"
          style={{
            backgroundColor: i <= level ? colors[level - 1] : "transparent",
            borderColor: i <= level ? colors[level - 1] : "#d1d5db",
          }}
        />
      ))}
    </div>
  );
}
