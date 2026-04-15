#include <glad/glad.h>
#include <GLFW/glfw3.h>
#define STB_IMAGE_IMPLEMENTATION
#include"stb_image.h"
#define GLM_ENABLE_EXPERIMENTAL
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <glm/gtx/transform.hpp>
#include <glm/gtx/rotate_vector.hpp>
#include <glm/gtx/norm.hpp>
#include <glm/gtx/quaternion.hpp>
#include <glm/gtx/vector_angle.hpp>
#include <glm/gtx/component_wise.hpp>
#include <vector>
#include <iostream>
#define _USE_MATH_DEFINES
#include <cmath>
#include <sstream>
#include <iomanip>
#include <cstring>
#include <chrono>
#include <fstream>
#include <sstream>
#include"Camera.h"
#include"shaderClass.h"
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
using namespace glm;
using namespace std;
using Clock = std::chrono::high_resolution_clock;

double lastPrintTime = 0.0;
int    framesCount   = 0;
double c = 299792458.0;
double G = 6.67430e-11;
struct Ray;
bool Gravity = false;



struct Quasar {
    vec3 position;
    double mass;
    double radius;
    double r_s; 

    Quasar(vec3 pos, float m) : position(pos), mass(m) { r_s = 2.0 * G * mass / (c*c);} 
};

struct Particles {
    glm::vec3 pos;
    glm::vec3 vel;
};

vector<string> faces = {
    "blue/bkg1_right.png",
    "blue/bkg1_left.png",
    "blue/bkg1_top.png",
    "blue/bkg1_bot.png",
    "blue/bkg1_front.png",
    "blue/bkg1_back.png"
};


const unsigned int width = 800;
const unsigned int height = 800;


float vertices[] = {
        0.0f, 0.4f, 0.0f,
        -0.4f, -0.4f, 0.0f,
        0.4f, -0.4f, 0.0f,
    };

float indices[] = {
    0, 1, 2,
    0, 2, 3,
    0, 1, 4,
    1, 2, 4,
    2, 3, 4,
    3, 0, 4
};

float quadVertices[] = {
    // positions   // texCoords
    -1.0f,  1.0f,   0.0f, 1.0f,
    -1.0f, -1.0f,   0.0f, 0.0f,
     1.0f, -1.0f,   1.0f, 0.0f,

    -1.0f,  1.0f,   0.0f, 1.0f,
     1.0f, -1.0f,   1.0f, 0.0f,
     1.0f,  1.0f,   1.0f, 1.0f
};

unsigned int loadCubemap(vector<string> faces)
    {
        unsigned int textureID;
        glGenTextures(1, &textureID);
        glBindTexture(GL_TEXTURE_CUBE_MAP, textureID);

        int w, h, nrChannels;

        for (unsigned int i = 0; i < faces.size(); i++)
        {
            unsigned char* data = stbi_load(faces[i].c_str(), &w, &h, &nrChannels, 0);
            if (data)
            {
                glTexImage2D(
                    GL_TEXTURE_CUBE_MAP_POSITIVE_X + i,
                    0, GL_RGB, w, h, 0, GL_RGB, GL_UNSIGNED_BYTE, data
                );
                stbi_image_free(data);
            }
            else
            {
                cout << "ERROR loading: " << faces[i] << endl;
            }
        }

        glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
        glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_WRAP_R, GL_CLAMP_TO_EDGE);

        return textureID;
    }



int main() {


    glfwInit();
    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
    glfwWindowHint(GLFW_OPENGL_PROFILE,GLFW_OPENGL_CORE_PROFILE);


    GLFWwindow* window = glfwCreateWindow(width, height, "kvazar", nullptr, nullptr);
    if (!window) {
        glfwTerminate();
        return -1;
    }
    glfwMakeContextCurrent(window);

    gladLoadGL();

    glViewport(0, 0, width, height);

    
    Shader shaderProgram("grid.vert", "grid.frag");
    shaderProgram.Activate();
    GLuint iResolutionLoc = glGetUniformLocation(shaderProgram.ID, "iResolution");
    GLuint camPosLoc = glGetUniformLocation(shaderProgram.ID, "cameraPosition");
    GLuint viewLoc = glGetUniformLocation(shaderProgram.ID, "view");
    GLuint projLoc = glGetUniformLocation(shaderProgram.ID, "projection");

    Camera camera(width, height, glm::vec3(0.0f, 1.0f, -8.0f));
    
    GLuint quadVAO, quadVBO;
    glGenVertexArrays(1, &quadVAO);
    glGenBuffers(1, &quadVBO);

    glBindVertexArray(quadVAO);
    glBindBuffer(GL_ARRAY_BUFFER, quadVBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof(quadVertices), quadVertices, GL_STATIC_DRAW);

    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), (void*)0);

    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 4 * sizeof(float), (void*)(2 * sizeof(float)));

    glBindVertexArray(0);


    float deltaTime = 0.0f;
    float lastFrame = 0.0f;

    stbi_set_flip_vertically_on_load(false);
    unsigned int skyboxTex = loadCubemap(faces);

    while (!glfwWindowShouldClose(window)) {
        glClearColor(0.17f, 0.20f, 0.3f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        float currentFrame = glfwGetTime();
        deltaTime = currentFrame - lastFrame;
        lastFrame = currentFrame;
        
        camera.Inputs(window, deltaTime);
        camera.Matrix(45.0f, 0.1f, 100.0f, shaderProgram, "camMatrix");

        shaderProgram.Activate();

        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_CUBE_MAP, skyboxTex);
        glUniform1i(glGetUniformLocation(shaderProgram.ID, "skybox"), 0);

        float timeLoc = glGetUniformLocation(shaderProgram.ID, "iTime");
        glUniform1f(timeLoc, currentFrame);
        glUniform2f(iResolutionLoc, width, height);
        glUniform3fv(camPosLoc, 1, glm::value_ptr(camera.Position));
        glUniformMatrix4fv(viewLoc, 1, GL_FALSE, glm::value_ptr(camera.GetViewMatrix()));
        glUniformMatrix4fv(projLoc, 1, GL_FALSE, glm::value_ptr(camera.GetProjectionMatrix()));
        
        glBindVertexArray(quadVAO);
        glDepthMask(GL_FALSE);
        glDrawArrays(GL_TRIANGLES, 0, 6);
        glDepthMask(GL_TRUE);

        glfwSwapBuffers(window); 
        glfwPollEvents();      
    }

   
    shaderProgram.Delete();
    glfwDestroyWindow(window);
    glfwTerminate();
    return 0;
}

