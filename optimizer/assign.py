"""Exact maximum-weight slot assignment (Hungarian algorithm), no dependencies."""
NEG = -1e9


def hungarian_max(weights):
    """weights: rows=slots, cols=players (rows <= cols). Returns list col index per row (or -1)."""
    n = len(weights)
    if n == 0:
        return []
    m = len(weights[0])
    real_m = m
    if m < n:  # pad with dummy players (empty slot)
        weights = [row + [NEG / 10] * (n - m) for row in weights]
        m = n
    INF = float("inf")
    cost = [[-w for w in row] for row in weights]
    u = [0.0] * (n + 1); v = [0.0] * (m + 1); p = [0] * (m + 1); way = [0] * (m + 1)
    for i in range(1, n + 1):
        p[0] = i; j0 = 0
        minv = [INF] * (m + 1); used = [False] * (m + 1)
        while True:
            used[j0] = True; i0 = p[j0]; delta = INF; j1 = 0
            for j in range(1, m + 1):
                if not used[j]:
                    cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j] = cur; way[j] = j0
                    if minv[j] < delta:
                        delta = minv[j]; j1 = j
            for j in range(m + 1):
                if used[j]:
                    u[p[j]] += delta; v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]; p[j0] = p[j1]; j0 = j1
            if j0 == 0:
                break
    res = [-1] * n
    for j in range(1, m + 1):
        if p[j] and j - 1 < real_m:
            res[p[j] - 1] = j - 1
    return res
