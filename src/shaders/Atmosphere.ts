export const atmosphereVertex = `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const atmosphereFragment = `
varying vec3 vNormal;
varying vec3 vPosition;

uniform vec3 glowColor;
uniform float coefficient;
uniform float power;

void main() {
    float intensity = pow(coefficient - dot(vNormal, vec3(0, 0, 1.0)), power);
    gl_FragColor = vec4(glowColor, intensity);
}
`;
