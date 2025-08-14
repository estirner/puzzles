# Skyscrapers Plugin

Data shape:

```
{
  size: number,
  top: number[],
  bottom: number[],
  left: number[],
  right: number[],
  mode?: { visibility?: 'count' | 'sum'; diagonals?: boolean }
  solution?: number[][]
}
```

State shape:

```
{ grid: number[][], notes: number[][][], selected?: { r: number; c: number } }
```


