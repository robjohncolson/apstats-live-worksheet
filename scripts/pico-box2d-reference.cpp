// Desktop reference for the pinned solver. Compile with the same upstream
// translation units and -ffp-contract=off; compare the WASM bridge against it.
#include <Box2D/Box2D.h>
#include <cstdio>

static void printBody(const char* name, const b2Body* body, bool last) {
  std::printf("\"%s\":{\"x\":%.9g,\"y\":%.9g,\"angle\":%.9g,\"vx\":%.9g,\"vy\":%.9g,\"mass\":%.9g}%s\n",
    name, body->GetPosition().x, body->GetPosition().y, body->GetAngle(),
    body->GetLinearVelocity().x, body->GetLinearVelocity().y, body->GetMass(), last ? "" : ",");
}

int main() {
  const float dt = 1.0f / 60.0f;
  std::printf("{\n");
  {
    b2World world(b2Vec2(0, 10));
    b2BodyDef definition; definition.type = b2_dynamicBody;
    b2Body* ball = world.CreateBody(&definition);
    b2CircleShape circle; circle.m_radius = .5f;
    ball->CreateFixture(&circle, 1);
    for (int i = 0; i < 60; ++i) world.Step(dt, 10, 10);
    printBody("fall", ball, false);
  }
  {
    b2World world(b2Vec2(0, 10));
    b2BodyDef floorDefinition; floorDefinition.position.Set(0, 5);
    b2Body* floor = world.CreateBody(&floorDefinition);
    b2PolygonShape box; box.SetAsBox(10, .5f); floor->CreateFixture(&box, 0);
    b2BodyDef definition; definition.type = b2_dynamicBody;
    b2Body* ball = world.CreateBody(&definition);
    b2CircleShape circle; circle.m_radius = .5f; ball->CreateFixture(&circle, 1);
    for (int i = 0; i < 240; ++i) world.Step(dt, 10, 10);
    printBody("floor", ball, false);
  }
  {
    b2World world(b2Vec2(0, 10));
    b2BodyDef anchorDefinition;
    b2Body* anchor = world.CreateBody(&anchorDefinition);
    b2BodyDef definition; definition.type = b2_dynamicBody; definition.position.Set(1, 0);
    b2Body* bar = world.CreateBody(&definition);
    b2PolygonShape box; box.SetAsBox(1, .1f); bar->CreateFixture(&box, 1);
    b2RevoluteJointDef joint; joint.Initialize(anchor, bar, b2Vec2(0, 0)); world.CreateJoint(&joint);
    for (int i = 0; i < 120; ++i) world.Step(dt, 10, 10);
    printBody("joint", bar, true);
  }
  std::printf("}\n");
}
