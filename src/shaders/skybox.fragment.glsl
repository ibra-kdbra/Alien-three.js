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
    
    // Nebula effect
    float nebula = hash(floor(dir * 2.0)) * 0.1;
    color += vec3(0.05, 0.0, 0.1) * nebula;

    gl_FragColor = vec4(color, 1.0);
}
