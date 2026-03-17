varying vec3 vWorldPosition;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
    vec3 dir = normalize(vWorldPosition);

    // Multi-layered star system for depth
    float star1 = hash(floor(dir * 250.0));
    float star2 = hash(floor(dir * 600.0));
    float star3 = hash(floor(dir * 1200.0));

    vec3 color = vec3(0.0);

    // Large bright stars
    if (star1 > 0.9995) {
        float intensity = pow(hash(dir * 123.0), 10.0) * 10.0;
        color += vec3(intensity) * vec3(1.0, 0.95, 0.9);
    }

    // Medium blue stars
    if (star2 > 0.9997) {
        float intensity = pow(hash(dir * 456.0), 15.0) * 5.0;
        color += vec3(intensity) * vec3(0.8, 0.9, 1.0);
    }

    // Dense tiny background stars
    if (star3 > 0.9998) {
        color += vec3(0.8);
    }

    // Realistic Milky Way band (very subtle dust/light)
    float milkyWay = pow(max(0.0, 1.0 - abs(dir.y + dir.x * 0.5)), 3.0) * 0.15;
    vec3 nebulaColor = vec3(0.05, 0.04, 0.08) * milkyWay;
    color += nebulaColor;

    gl_FragColor = vec4(color, 1.0);
}
