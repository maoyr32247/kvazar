#ifndef CAMERA_CLASS_H
#define CAMERA_CLASS_H


#include <glad/glad.h>
#include <GLFW/glfw3.h>
#define GLM_ENABLE_EXPERIMENTAL
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <glm/gtx/rotate_vector.hpp>
#include <glm/gtx/vector_angle.hpp>

#include"shaderClass.h"

class Camera
{
    public:
        glm::vec3 Position;
        glm::vec3 Orientation = glm::vec3(0.0f, 0.0f,2.0f);
        glm::vec3 Up = glm::vec3(0.0f, 1.0f, 0.0f);
        glm::mat4 cameraMatrix = glm::mat4(1.0f);

        bool firstClick = true;

        int width;
        int height;

        float sensitivity = 100.0f;

        Camera(int width, int height, glm::vec3 position);

        void updateMatrix(float FOVdeg, float nearPlane, float farPlane);
        void Matrix(float FOVdeg, float nearPlane, float farPlane, Shader& shader, const char* uniform);
        void Inputs(GLFWwindow* window, float deltaTime);

        glm::mat4 GetViewMatrix() { 
        return glm::lookAt(Position, Position + Orientation, Up); 
        }

        glm::mat4 GetProjectionMatrix(float FOVdeg = 45.0f, float nearPlane = 0.1f, float farPlane = 100.0f) {
        return glm::perspective(glm::radians(FOVdeg), (float)width / (float)height, nearPlane, farPlane);
        }
};

#endif