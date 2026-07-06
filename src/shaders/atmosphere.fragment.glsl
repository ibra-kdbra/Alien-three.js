varying vec3 vNormal;
varying vec3 vPosition;

uniform vec3 glowColor;
uniform float coefficient;
uniform float power;

void main() {
    // Dynamic view direction in view-space for proper perspective projection
    vec3 viewDir = normalize(-vPosition);
    float dotProduct = dot(vNormal, viewDir);
    
    // Fresnel rim intensity (use abs so it works perfectly from both inside and outside the atmosphere)
    float intensity = pow(max(0.0, coefficient - abs(dotProduct)), power);
    
    // Atmospheric scatter color gradient (warm sunset orange to electric cyan)
    vec3 innerColor = vec3(1.0, 0.45, 0.15); // Sunset scatter
    vec3 outerColor = glowColor;             // Space edge cyan
    
    // Interpolate colors based on dot product transition
    vec3 finalColor = mix(innerColor, outerColor, smoothstep(0.0, 0.5, dotProduct));
    
    gl_FragColor = vec4(finalColor, intensity);
}
