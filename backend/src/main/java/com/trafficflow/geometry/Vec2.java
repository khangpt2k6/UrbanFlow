package com.trafficflow.geometry;

/** Immutable 2D vector in world meters. */
public record Vec2(double x, double y) {

    public Vec2 add(Vec2 o) {
        return new Vec2(x + o.x, y + o.y);
    }

    public Vec2 sub(Vec2 o) {
        return new Vec2(x - o.x, y - o.y);
    }

    public Vec2 scale(double k) {
        return new Vec2(x * k, y * k);
    }

    public double length() {
        return Math.hypot(x, y);
    }

    public double distance(Vec2 o) {
        return Math.hypot(x - o.x, y - o.y);
    }

    /** Linear interpolation: t=0 returns this, t=1 returns o. */
    public Vec2 lerp(Vec2 o, double t) {
        return new Vec2(x + (o.x - x) * t, y + (o.y - y) * t);
    }

    public double heading() {
        return Math.atan2(y, x);
    }
}
