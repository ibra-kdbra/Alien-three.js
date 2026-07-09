varying vec3 vWorldPosition;
uniform float uTime;

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
    vec3 color = vec3(0.008, 0.004, 0.015);

    // --- Multi-layered star system with time-based twinkling ---
    
    // Large bright warm stars
    float star1 = hash(floor(dir * 250.0));
    if (star1 > 0.9994) {
        float twinkle = 0.5 + 0.5 * sin(uTime * 2.5 + star1 * 100.0);
        float intensity = pow(hash(dir * 123.0), 8.0) * 8.0 * twinkle;
        vec3 starColor = mix(vec3(1.0, 0.9, 0.8), vec3(0.8, 0.9, 1.0), hash(dir * 77.0));
        color += vec3(intensity) * starColor;
    }

    // Medium blue-white stars
    float star2 = hash(floor(dir * 600.0));
    if (star2 > 0.9996) {
        float twinkle = 0.4 + 0.6 * sin(uTime * 3.8 + star2 * 200.0);
        float intensity = pow(hash(dir * 456.0), 12.0) * 4.0 * twinkle;
        color += vec3(intensity) * vec3(0.85, 0.92, 1.0);
    }

    // Dense tiny background stars
    float star3 = hash(floor(dir * 1200.0));
    if (star3 > 0.9997) {
        float twinkle = 0.6 + 0.4 * sin(uTime * 1.5 + star3 * 300.0);
        color += vec3(0.6, 0.65, 0.7) * (0.4 + 0.6 * twinkle);
    }

    // Ultra-faint star dust
    float star4 = hash(floor(dir * 2400.0));
    if (star4 > 0.9998) {
        color += vec3(0.25, 0.28, 0.3);
    }

    // --- Nebula bands with slow time-based shifting ---
    
    // Purple nebula band across the sky
    float nebula1 = fbm(dir * 3.0 + vec3(uTime * 0.005, 0.5 + uTime * 0.003, 0.0));
    float band1 = pow(max(0.0, 1.0 - abs(dir.y + dir.x * 0.3 - 0.1)), 4.0);
    vec3 nebulaColor1 = vec3(0.18, 0.06, 0.25) * nebula1 * band1;
    color += nebulaColor1;

    // Teal/cyan nebula in a different region
    float nebula2 = fbm(dir * 4.0 + vec3(2.0 + uTime * 0.004, -uTime * 0.002, 1.0));
    float band2 = pow(max(0.0, 1.0 - abs(dir.y - dir.z * 0.4 + 0.2)), 5.0);
    vec3 nebulaColor2 = vec3(0.02, 0.12, 0.15) * nebula2 * band2;
    color += nebulaColor2;

    // Warm orange/red accent (milky way glow)
    float nebula3 = fbm(dir * 2.5 + vec3(1.0 - uTime * 0.003, 0.3, 0.5 + uTime * 0.005));
    float band3 = pow(max(0.0, 1.0 - abs(dir.y + 0.05)), 6.0) * 0.5;
    vec3 nebulaColor3 = vec3(0.15, 0.05, 0.02) * nebula3 * band3;
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
    }
    
    // Moon atmospheric glow
    if (moonDot > moonSize - 0.003) {
        float glowT = smoothstep(moonSize - 0.003, moonSize, moonDot);
        color += vec3(0.12, 0.07, 0.18) * glowT * 0.6;
    }

    // --- Gas giant with rings: the sky landmark ---
    // Sits opposite the moon so the two anchor different halves of the sky;
    // players orient by it the way you orient by a mountain range.
    vec3 gDir = normalize(vec3(-0.55, 0.30, -0.78));
    float gDot = dot(dir, gDir);
    if (gDot > 0.9) {
        vec3 gRight = normalize(cross(vec3(0.0, 1.0, 0.0), gDir));
        vec3 gUp = normalize(cross(gDir, gRight));
        vec2 gUV = vec2(dot(dir, gRight), dot(dir, gUp));

        // Tilt the whole planet+ring system for a dynamic composition
        float ct = cos(-0.35), st = sin(-0.35);
        vec2 tUV = vec2(gUV.x * ct - gUV.y * st, gUV.x * st + gUV.y * ct);

        float gRadius = 0.085; // ~10 degrees of sky — a true landmark
        float gDist = length(tUV) / gRadius;

        // Rings first (drawn under the disc): squashed ellipse, near-edge-on
        vec2 rUV = vec2(tUV.x, tUV.y * 5.5);
        float ringR = length(rUV) / gRadius;
        if (ringR > 1.25 && ringR < 2.4 && !(tUV.y > 0.0 && gDist < 1.0)) {
            float ringNoise = noise(vec3(ringR * 22.0, 1.0, 4.2));
            float ringBands = 0.55 + 0.45 * sin(ringR * 26.0 + ringNoise * 2.0);
            float ringMask = smoothstep(1.25, 1.4, ringR) * (1.0 - smoothstep(2.05, 2.4, ringR));
            color += vec3(0.75, 0.60, 0.44) * ringBands * ringMask * 0.4;
        }

        // Banded gas disc with turbulence, limb darkening and a terminator
        if (gDist < 1.0) {
            float lat = tUV.y / gRadius;
            float turb = fbm(vec3(tUV * 55.0, 3.7));
            float bands = sin(lat * 13.0 + turb * 3.5 + tUV.x / gRadius * 0.6);
            vec3 bandA = vec3(0.82, 0.52, 0.30); // warm amber
            vec3 bandB = vec3(0.42, 0.22, 0.32); // dusty violet-rose
            vec3 gasColor = mix(bandB, bandA, bands * 0.5 + 0.5);

            float z = sqrt(max(0.0, 1.0 - gDist * gDist));
            float shade = 0.25 + 0.75 * pow(z, 0.7);
            float terminator = clamp(0.55 + 0.6 * (tUV.x / gRadius), 0.3, 1.0);
            vec3 discColor = gasColor * shade * terminator * 1.2;

            float edge = smoothstep(1.0, 0.985, gDist);
            color = mix(color, discColor, edge);
        }

        // Soft atmospheric halo around the limb
        float outer = max(gDist - 1.0, 0.0);
        color += vec3(0.30, 0.15, 0.10) * exp(-outer * 7.0) * 0.3 * step(1.0, gDist);
    }

    // --- Horizon gradient (atmospheric scattering effect) ---
    float horizonFactor = pow(max(0.0, 1.0 - abs(dir.y)), 8.0);
    vec3 horizonColor = vec3(0.08, 0.03, 0.15); // Deep purple space haze
    color += horizonColor * horizonFactor * 0.5;

    gl_FragColor = vec4(color, 1.0);
}
