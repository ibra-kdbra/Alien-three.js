varying vec3 vWorldPosition;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
    vec3 dir = normalize(vWorldPosition);
    float star = hash(floor(dir * 500.0));

    vec3 color = vec3(0.0);
    if (star > 0.99) {
        float intensity = pow(hash(dir * 123.0), 10.0) * 2.0;
        color = vec3(intensity);
    }

    // High-Fidelity Nebula effect (Purple/Pink)
    float n1 = hash(floor(dir * 1.0));
    float n2 = hash(floor(dir * 3.0));
    float n3 = hash(floor(dir * 5.0));

    vec3 nebula1 = vec3(0.1, 0.0, 0.2) * n1; // Deep purple
    vec3 nebula2 = vec3(0.2, 0.0, 0.1) * n2; // Pinkish
    vec3 nebula3 = vec3(0.0, 0.05, 0.1) * n3; // Deep blue

    color += nebula1 + nebula2 + nebula3;

    gl_FragColor = vec4(color, 1.0);
}
