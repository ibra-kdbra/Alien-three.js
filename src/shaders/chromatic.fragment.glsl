uniform sampler2D tDiffuse;
uniform float offset;
uniform float uWarningIntensity;
uniform float uTime;
varying vec2 vUv;

void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    vec4 r = texture2D(tDiffuse, vUv + vec2(offset, 0.0));
    vec4 b = texture2D(tDiffuse, vUv - vec2(offset, 0.0));
    vec4 finalColor = vec4(r.r, color.g, b.b, color.a);
    
    // Vignette calculation for atmospheric depth
    vec2 uv = vUv * (1.0 - vUv);
    float vignette = uv.x * uv.y * 15.0;
    vignette = pow(vignette, 0.25);
    
    // Low oxygen warning flash vignette (red heartbeat flash around screen borders)
    float borderFactor = 1.0 - vignette; // 0 at center, 1 at edges
    float flash = 0.5 + 0.5 * sin(uTime * 8.0);
    vec3 warningColor = vec3(1.0, 0.0, 0.0) * borderFactor * uWarningIntensity * flash * 0.45;
    
    // Blend vignette and red heartbeat border
    gl_FragColor = vec4(finalColor.rgb * vignette + warningColor, finalColor.a);
}
