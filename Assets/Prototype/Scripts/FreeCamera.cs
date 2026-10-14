using UnityEngine;

namespace CityBuilder.Prototype
{
    /// Stadscamera zoals in Cities: Skylines: het draaipunt ligt op het maaiveld (dus je kunt tot
    /// op straatniveau inzoomen), pannen gaat sneller naarmate je verder uitgezoomd bent, en je
    /// kunt kantelen van bijna recht van boven tot bijna horizontaal.
    /// Besturing: WASD/pijlen of middelste muisknop = pannen, Q/E of rechtermuisknop slepen =
    /// draaien, R/F of rechtermuisknop verticaal = kantelen, scrollwiel = zoomen.
    /// Zoom blijft begrensd (zie 02-spike1-rendering.md, sectie 2): ver uitgezoomd is het duurst.
    [AddComponentMenu("City Builder/Free Camera")]
    public class FreeCamera : MonoBehaviour
    {
        [Header("Pan")]
        public float panSpeed = 40f;
        public float panBoundsHalfSize = 240f;

        [Header("Zoom")]
        public float zoomSpeed = 25f;
        public float minZoomDistance = 8f;
        public float maxZoomDistance = 220f;

        [Header("Rotate")]
        public float rotateSpeed = 90f;
        public float mouseRotateSpeed = 5f;

        [Header("Kantelen")]
        public float pitchAngle = 50f;
        public float minPitch = 12f;
        public float maxPitch = 85f;

        float _yaw;
        float _distance;
        float _doelAfstand;
        Vector3 _focusPoint;

        void Start()
        {
            _yaw = transform.eulerAngles.y;
            Vector3 pos = transform.position, fwd = transform.forward;
            float grond = GrondHoogte(pos.x, pos.z);
            float t = fwd.y < -0.05f ? (grond - pos.y) / fwd.y : 150f;
            _focusPoint = pos + fwd * Mathf.Clamp(t, 10f, 600f);
            _focusPoint.y = GrondHoogte(_focusPoint.x, _focusPoint.z);
            _distance = Mathf.Clamp(Vector3.Distance(pos, _focusPoint), minZoomDistance, maxZoomDistance);
            _doelAfstand = _distance;
            ApplyTransform();
        }

        void Update()
        {
            HandlePan();
            HandleRotate();
            HandleZoom();
            ApplyTransform();
        }

        static float GrondHoogte(float x, float z)
        {
            var t = Terrain.activeTerrain;
            return t != null ? t.SampleHeight(new Vector3(x, 0f, z)) + t.transform.position.y : 0f;
        }

        void HandlePan()
        {
            Quaternion yawRot = Quaternion.Euler(0f, _yaw, 0f);
            Vector3 forward = yawRot * Vector3.forward;
            Vector3 right = yawRot * Vector3.right;

            Vector3 move = Vector3.zero;
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) move += forward;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) move -= forward;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) move += right;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) move -= right;
            if (move.sqrMagnitude > 1f) move.Normalize();

            float schaal = Mathf.Clamp(_distance / 100f, 0.25f, 4f);
            _focusPoint += move * panSpeed * schaal * Time.deltaTime;

            if (Input.GetMouseButton(2))
            {
                _focusPoint -= right * Input.GetAxis("Mouse X") * 2f * schaal;
                _focusPoint -= forward * Input.GetAxis("Mouse Y") * 2f * schaal;
            }

            _focusPoint.x = Mathf.Clamp(_focusPoint.x, -panBoundsHalfSize, panBoundsHalfSize);
            _focusPoint.z = Mathf.Clamp(_focusPoint.z, -panBoundsHalfSize, panBoundsHalfSize);
            _focusPoint.y = Mathf.Lerp(_focusPoint.y, GrondHoogte(_focusPoint.x, _focusPoint.z), Mathf.Clamp01(Time.deltaTime * 8f));
        }

        void HandleRotate()
        {
            if (Input.GetMouseButton(1))
            {
                _yaw += Input.GetAxis("Mouse X") * rotateSpeed * mouseRotateSpeed * Time.deltaTime;
                pitchAngle -= Input.GetAxis("Mouse Y") * rotateSpeed * mouseRotateSpeed * 0.5f * Time.deltaTime;
            }

            if (Input.GetKey(KeyCode.Q)) _yaw -= rotateSpeed * Time.deltaTime;
            if (Input.GetKey(KeyCode.E)) _yaw += rotateSpeed * Time.deltaTime;
            if (Input.GetKey(KeyCode.R)) pitchAngle += rotateSpeed * 0.5f * Time.deltaTime;
            if (Input.GetKey(KeyCode.F)) pitchAngle -= rotateSpeed * 0.5f * Time.deltaTime;
            pitchAngle = Mathf.Clamp(pitchAngle, minPitch, maxPitch);
        }

        void HandleZoom()
        {
            float scroll = Input.GetAxis("Mouse ScrollWheel");
            // Zoomen in verhouding tot de huidige afstand: dichtbij fijn, ver weg snel.
            _doelAfstand = Mathf.Clamp(_doelAfstand * (1f - scroll * zoomSpeed * 0.06f), minZoomDistance, maxZoomDistance);
            _distance = Mathf.Lerp(_distance, _doelAfstand, Mathf.Clamp01(Time.deltaTime * 10f));
        }

        void ApplyTransform()
        {
            Quaternion rot = Quaternion.Euler(pitchAngle, _yaw, 0f);
            Vector3 positie = _focusPoint + rot * Vector3.back * _distance;
            float grond = GrondHoogte(positie.x, positie.z) + 2f;
            if (positie.y < grond) positie.y = grond;
            transform.SetPositionAndRotation(positie, rot);
        }
    }
}
