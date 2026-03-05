uniform sampler2D diffuseMap;
uniform vec3 color1;
uniform vec3 color2;
uniform float scale;

varying vec3 vNormal;
varying vec3 vWorldPosition;

// Simple hash for noise
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
                   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main() {
    // Triplanar weights
    vec3 blending = abs(vNormal);
    blending /= (blending.x + blending.y + blending.z);

    // Triplanar UVs
    vec2 xUV = vWorldPosition.zy * scale;
    vec2 yUV = vWorldPosition.xz * scale;
    vec2 zUV = vWorldPosition.xy * scale;

    // Sample or Generate Detail
    float d1 = noise(vWorldPosition * scale * 2.0);
    float d2 = noise(vWorldPosition * scale * 8.0);
    float cracks = pow(1.0 - abs(noise(vWorldPosition * scale * 0.5) - 0.5) * 2.0, 10.0);

    vec3 baseColor = mix(color1, color2, d1);
    baseColor = mix(baseColor, vec3(0.0, 0.05, 0.05), cracks); // Crack color

    // Lighting (Simple)
    float diff = max(dot(vNormal, normalize(vec3(1.0, 1.0, 1.0))), 0.2);

    gl_FragColor = vec4(baseColor * diff, 1.0);
}
