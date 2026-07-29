using UnityEngine;

namespace CityBuilder.Prototype
{
    /// Pan/zoom/rotate camera for the rendering spike. Pure transform math, no physics.
    /// Zoom is hard-capped on purpose: CS2's worst frame times showed up at wide, zoomed-out
    /// views, so limiting max zoom-out is the first lever to pull if the budget isn't met (see
    /// 02-spike1-rendering.md section 2).
    [AddComponentMenu("City Builder/Free Camera")]
    public class FreeCamera : MonoBehaviour
    {
        [Header("Pan")]
        public float panSpeed = 40f;
        public float panBoundsHalfSize = 240f; // keeps the camera within the ~500x500m terrain

        [Header("Zoom")]
        public float zoomSpeed = 25f;
        public float minZoomDistance = 15f;
        public float maxZoomDistance = 220f;

        [Header("Rotate")]
        public float rotateSpeed = 90f;
        public float mouseRotateSpeed = 5f;

        [Header("Isometric angle")]
        public float pitchAngle = 50f;

        float _yaw;
        float _distance;
        Vector3 _focusPoint;

        void Start()
        {
            _distance = Mathf.Clamp(maxZoomDistance * 0.5f, minZoomDistance, maxZoomDistance);
            _yaw = transform.eulerAngles.y;
            _focusPoint = transform.position;
            ApplyTransform();
        }

        void Update()
        {
            HandlePan();
            HandleRotate();
            HandleZoom();
            ApplyTransform();
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

            if (Input.GetMouseButton(2)) // middle-mouse drag pan
            {
                move -= right * Input.GetAxis("Mouse X") * 2f;
                move -= forward * Input.GetAxis("Mouse Y") * 2f;
            }

            if (move.sqrMagnitude > 1f) move.Normalize();
            _focusPoint += move * panSpeed * Time.deltaTime;
            _focusPoint.x = Mathf.Clamp(_focusPoint.x, -panBoundsHalfSize, panBoundsHalfSize);
            _focusPoint.z = Mathf.Clamp(_focusPoint.z, -panBoundsHalfSize, panBoundsHalfSize);
        }

        void HandleRotate()
        {
            if (Input.GetMouseButton(1)) // right-mouse drag rotate
                _yaw += Input.GetAxis("Mouse X") * rotateSpeed * mouseRotateSpeed * Time.deltaTime;

            if (Input.GetKey(KeyCode.Q)) _yaw -= rotateSpeed * Time.deltaTime;
            if (Input.GetKey(KeyCode.E)) _yaw += rotateSpeed * Time.deltaTime;
        }

        void HandleZoom()
        {
            float scroll = Input.GetAxis("Mouse ScrollWheel");
            _distance = Mathf.Clamp(_distance - scroll * zoomSpeed * 10f, minZoomDistance, maxZoomDistance);
        }

        void ApplyTransform()
        {
            Quaternion rot = Quaternion.Euler(pitchAngle, _yaw, 0f);
            Vector3 offset = rot * Vector3.back * _distance;
            transform.SetPositionAndRotation(_focusPoint + offset, rot);
        }
    }
}
