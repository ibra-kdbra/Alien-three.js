varying vec3 vWorldPosition;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// Smooth noise for nebula
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n = mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
        f.z);
    return n;
}

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return value;
}

void main() {
    vec3 dir = normalize(vWorldPosition);

    // Base dark space color — deep blue-black
    vec3 color = vec3(0.01, 0.005, 0.02);

    // --- Multi-layered star system ---
    // Large bright warm stars
    float star1 = hash(floor(dir * 250.0));
    if (star1 > 0.9994) {
        float intensity = pow(hash(dir * 123.0), 8.0) * 8.0;
        vec3 starColor = mix(vec3(1.0, 0.9, 0.8), vec3(0.8, 0.9, 1.0), hash(dir * 77.0));
        color += vec3(intensity) * starColor;
    }

    // Medium blue-white stars
    float star2 = hash(floor(dir * 600.0));
    if (star2 > 0.9996) {
        float intensity = pow(hash(dir * 456.0), 12.0) * 4.0;
        color += vec3(intensity) * vec3(0.85, 0.92, 1.0);
    }

    // Dense tiny background stars
    float star3 = hash(floor(dir * 1200.0));
    if (star3 > 0.9997) {
        color += vec3(0.6, 0.65, 0.7);
    }

    // Ultra-faint star dust
    float star4 = hash(floor(dir * 2400.0));
    if (star4 > 0.9998) {
        color += vec3(0.25, 0.28, 0.3);
    }

    // --- Nebula bands ---
    // Purple nebula band across the sky
    float nebula1 = fbm(dir * 3.0 + vec3(0.0, 0.5, 0.0));
    float band1 = pow(max(0.0, 1.0 - abs(dir.y + dir.x * 0.3 - 0.1)), 4.0);
    vec3 nebulaColor1 = vec3(0.15, 0.05, 0.2) * nebula1 * band1;
    color += nebulaColor1;

    // Teal/cyan nebula in a different region
    float nebula2 = fbm(dir * 4.0 + vec3(2.0, 0.0, 1.0));
    float band2 = pow(max(0.0, 1.0 - abs(dir.y - dir.z * 0.4 + 0.2)), 5.0);
    vec3 nebulaColor2 = vec3(0.02, 0.1, 0.12) * nebula2 * band2;
    color += nebulaColor2;

    // Warm orange/red accent (milky way glow)
    float nebula3 = fbm(dir * 2.5 + vec3(1.0, 0.3, 0.5));
    float band3 = pow(max(0.0, 1.0 - abs(dir.y + 0.05)), 6.0) * 0.5;
    vec3 nebulaColor3 = vec3(0.12, 0.04, 0.02) * nebula3 * band3;
    color += nebulaColor3;

    // --- Distant planet/moon in the sky ---
    vec3 moonDir = normalize(vec3(0.6, 0.35, -0.7));
    float moonDot = dot(dir, moonDir);
    float moonSize = 0.998;

    if (moonDot > moonSize) {
        // Moon surface
        float t = (moonDot - moonSize) / (1.0 - moonSize);
        float moonNoise = fbm(dir * 60.0);
        vec3 moonColor = mix(
            vec3(0.15, 0.12, 0.18),
            vec3(0.25, 0.2, 0.28),
            moonNoise
        );
        // Limb darkening
        float limb = smoothstep(moonSize, moonSize + 0.001, moonDot);
        color = mix(color, moonColor * 1.5, limb * 0.9);

        // Thin atmosphere glow on the moon
    }
    // Moon atmospheric glow
    if (moonDot > moonSize - 0.003) {
        float glowT = smoothstep(moonSize - 0.003, moonSize, moonDot);
        color += vec3(0.1, 0.06, 0.15) * glowT * 0.6;
    }

    // --- Horizon gradient (atmospheric scattering effect) ---
    float horizonFactor = pow(max(0.0, 1.0 - abs(dir.y)), 8.0);
    vec3 horizonColor = vec3(0.08, 0.03, 0.12); // Deep purple haze
    color += horizonColor * horizonFactor * 0.4;

    gl_FragColor = vec4(color, 1.0);
}
