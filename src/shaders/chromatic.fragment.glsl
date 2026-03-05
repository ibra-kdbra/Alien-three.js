uniform sampler2D tDiffuse;
uniform float offset;
varying vec2 vUv;

void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    vec4 r = texture2D(tDiffuse, vUv + vec2(offset, 0.0));
    vec4 b = texture2D(tDiffuse, vUv - vec2(offset, 0.0));
    gl_FragColor = vec4(r.r, color.g, b.b, color.a);
}
