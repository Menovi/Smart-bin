"""Routing endpoint.

A compact Python port of the ACO-LNS-ILS hybrid (your paper), designed to be
called from the frontend Smart Route button. The frontend's existing
JavaScript implementation can stay; this server-side version is useful when
you have many bins, want OSRM road-snapping, or run optimisation in batch.
"""
import math
import random
from typing import List, Tuple
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/routing", tags=["routing"])


class Stop(BaseModel):
    id: str
    lat: float
    lng: float
    demand: float = 1.0


class CVRPRequest(BaseModel):
    depot: Stop
    stops: List[Stop]
    vehicle_capacity: float = 50.0
    num_ants: int = 18
    iterations: int = 50
    alpha: float = 1.0
    beta: float = 2.5
    rho: float = 0.15
    lns_frac: float = 0.25
    ils_restarts: int = 3


class CVRPResponse(BaseModel):
    routes: List[List[str]]
    total_distance_km: float


def haversine(a: Stop, b: Stop) -> float:
    R = 6371.0
    p1, p2 = math.radians(a.lat), math.radians(b.lat)
    dp = math.radians(b.lat - a.lat); dl = math.radians(b.lng - a.lng)
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))


def route_cost(route: List[Stop]) -> float:
    return sum(haversine(route[i], route[i+1]) for i in range(len(route)-1))


def split_into_routes(seq: List[Stop], depot: Stop, cap: float) -> List[List[Stop]]:
    routes, cur, load = [], [depot], 0.0
    for s in seq:
        if load + s.demand > cap and len(cur) > 1:
            cur.append(depot); routes.append(cur); cur = [depot]; load = 0.0
        cur.append(s); load += s.demand
    if len(cur) > 1:
        cur.append(depot); routes.append(cur)
    return routes


def two_opt(route: List[Stop]) -> List[Stop]:
    best = route[:]; improved = True
    while improved:
        improved = False
        for i in range(1, len(best)-2):
            for j in range(i+1, len(best)-1):
                if j-i == 1: continue
                new = best[:i] + best[i:j+1][::-1] + best[j+1:]
                if route_cost(new) + 1e-9 < route_cost(best):
                    best = new; improved = True
    return best


def aco_construct(depot: Stop, stops: List[Stop], pher, req: CVRPRequest) -> List[Stop]:
    n = len(stops); idx = {s.id: i for i, s in enumerate(stops)}
    seq = []; remaining = stops[:]
    current = depot
    while remaining:
        weights = []
        for s in remaining:
            d = haversine(current, s) + 1e-6
            ph = pher.get((current.id, s.id), 1.0)
            w = (ph ** req.alpha) * ((1.0/d) ** req.beta)
            weights.append(w)
        total = sum(weights)
        r = random.random() * total; acc = 0.0; pick = remaining[-1]
        for s, w in zip(remaining, weights):
            acc += w
            if acc >= r: pick = s; break
        seq.append(pick); remaining.remove(pick); current = pick
    return seq


def lns_repair(routes: List[List[Stop]], depot: Stop, cap: float, frac: float) -> List[List[Stop]]:
    flat = [s for r in routes for s in r if s.id != depot.id]
    k = max(1, int(len(flat) * frac))
    removed = random.sample(flat, k); kept = [s for s in flat if s not in removed]
    new_routes = split_into_routes(kept, depot, cap)
    # cheapest insertion
    for r in removed:
        best_cost, best_pos = float('inf'), (0, 1)
        for ri, route in enumerate(new_routes):
            for pos in range(1, len(route)):
                trial = route[:pos] + [r] + route[pos:]
                load = sum(s.demand for s in trial if s.id != depot.id)
                if load > cap: continue
                c = route_cost(trial)
                if c < best_cost:
                    best_cost, best_pos = c, (ri, pos)
        ri, pos = best_pos
        if best_cost == float('inf'):
            new_routes.append([depot, r, depot])
        else:
            new_routes[ri] = new_routes[ri][:pos] + [r] + new_routes[ri][pos:]
    return [two_opt(r) for r in new_routes]


def total_cost(routes: List[List[Stop]]) -> float:
    return sum(route_cost(r) for r in routes)


def double_bridge(seq: List[Stop]) -> List[Stop]:
    n = len(seq)
    if n < 8: return seq[:]
    p1 = 1 + random.randint(0, n // 4)
    p2 = p1 + 1 + random.randint(0, n // 4)
    p3 = p2 + 1 + random.randint(0, n // 4)
    return seq[:p1] + seq[p3:] + seq[p2:p3] + seq[p1:p2]


@router.post("/solve", response_model=CVRPResponse)
def solve(req: CVRPRequest):
    if not req.stops:
        return CVRPResponse(routes=[], total_distance_km=0.0)

    pher = {}
    best_routes, best_cost = None, float('inf')

    for _ in range(req.iterations):
        for _ant in range(req.num_ants):
            seq = aco_construct(req.depot, req.stops, pher, req)
            routes = split_into_routes(seq, req.depot, req.vehicle_capacity)
            routes = [two_opt(r) for r in routes]
            routes = lns_repair(routes, req.depot, req.vehicle_capacity, req.lns_frac)
            c = total_cost(routes)
            if c < best_cost:
                best_cost, best_routes = c, routes

        # ILS on best
        for _ in range(req.ils_restarts):
            flat = [s for r in (best_routes or []) for s in r if s.id != req.depot.id]
            perturbed = double_bridge(flat)
            cand = lns_repair(split_into_routes(perturbed, req.depot, req.vehicle_capacity),
                              req.depot, req.vehicle_capacity, req.lns_frac)
            c = total_cost(cand)
            if c < best_cost * 1.15:
                if c < best_cost: best_cost, best_routes = c, cand

        # pheromone evaporation + reinforcement
        for k in list(pher.keys()):
            pher[k] = max(0.1, pher[k] * (1 - req.rho))
        if best_routes:
            for r in best_routes:
                for i in range(len(r)-1):
                    pher[(r[i].id, r[i+1].id)] = pher.get((r[i].id, r[i+1].id), 1.0) + 1.0/(best_cost + 1e-6)

    return CVRPResponse(
        routes=[[s.id for s in r] for r in (best_routes or [])],
        total_distance_km=round(best_cost, 3),
    )
