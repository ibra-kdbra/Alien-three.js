uniform sampler2D tDiffuse;
uniform float offset;
varying vec2 vUv;

void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    vec4 r = texture2D(tDiffuse, vUv + vec2(offset, 0.0));
    vec4 b = texture2D(tDiffuse, vUv - vec2(offset, 0.0));
    vec4 finalColor = vec4(r.r, color.g, b.b, color.a);
    
    // Vignette calculation for atmospheric depth
    vec2 uv = vUv * (1.0 - vUv.yx);
    float vignette = uv.x * uv.y * 15.0;
    vignette = pow(vignette, 0.25);
    
    gl_FragColor = finalColor * vignette;
}
