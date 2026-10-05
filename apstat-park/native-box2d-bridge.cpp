// Project-owned C ABI for the unmodified, pinned Box2D 2.3.1 source.
// Units are Box2D meters/seconds except the explicitly native rectangle helper.
#include <Box2D/Box2D.h>

extern "C" {
b2World* pico_world_create(float x, float y) { return new b2World(b2Vec2(x, y)); }
void pico_world_destroy(b2World* world) { delete world; }
void pico_world_step(b2World* world, float dt, int velocityIterations, int positionIterations) {
  world->Step(dt, velocityIterations, positionIterations);
}
b2Body* pico_body_create(b2World* world, int type, float x, float y, float angle,
                        float linearDamping, float angularDamping, float gravityScale, int flags) {
  b2BodyDef definition;
  definition.type = static_cast<b2BodyType>(type);
  definition.position.Set(x, y);
  definition.angle = angle;
  definition.linearDamping = linearDamping;
  definition.angularDamping = angularDamping;
  definition.gravityScale = gravityScale;
  definition.allowSleep = (flags & 1) != 0;
  definition.awake = (flags & 2) != 0;
  definition.fixedRotation = (flags & 4) != 0;
  definition.bullet = (flags & 8) != 0;
  definition.active = (flags & 16) != 0;
  return world->CreateBody(&definition);
}
void pico_body_destroy(b2World* world, b2Body* body) { world->DestroyBody(body); }
// bbe5c70 builds the hull in pixels. bbe5d30 scales vertices only, retaining
// the hull's original centroid and normals. SetAsBox in meters is not equivalent.
b2Fixture* pico_fixture_native_rectangle(b2Body* body, float x, float y, float width, float height,
                                         float density, float friction, float restitution, int sensor) {
  b2Vec2 vertices[4] = { b2Vec2(x, -(y + height)), b2Vec2(x + width, -(y + height)),
                         b2Vec2(x + width, -y), b2Vec2(x, -y) };
  b2PolygonShape shape;
  shape.Set(vertices, 4);
  for (int i = 0; i < shape.m_count; ++i) shape.m_vertices[i] *= 0.01f;
  b2FixtureDef definition;
  definition.shape = &shape;
  definition.density = density;
  definition.friction = friction;
  definition.restitution = restitution;
  definition.isSensor = sensor != 0;
  return body->CreateFixture(&definition);
}
// Inspection uses the body's linked fixture order (newest first).
float pico_polygon_read(b2Body* body, int fixtureIndex, int field, int vertex) {
  b2Fixture* fixture = body->GetFixtureList();
  for (int i = 0; fixture && i < fixtureIndex; ++i) fixture = fixture->GetNext();
  if (!fixture || fixture->GetType() != b2Shape::e_polygon) return -1.0f;
  const b2PolygonShape* shape = static_cast<const b2PolygonShape*>(fixture->GetShape());
  if (field == 0) return static_cast<float>(shape->m_count);
  if (field == 1) return shape->m_radius;
  if (field == 2) return shape->m_centroid.x;
  if (field == 3) return shape->m_centroid.y;
  if (vertex < 0 || vertex >= shape->m_count) return -1.0f;
  switch (field) {
    case 4: return shape->m_vertices[vertex].x;
    case 5: return shape->m_vertices[vertex].y;
    case 6: return shape->m_normals[vertex].x;
    case 7: return shape->m_normals[vertex].y;
    default: return -1.0f;
  }
}
b2Fixture* pico_fixture_box(b2Body* body, float halfWidth, float halfHeight, float x, float y,
                           float angle, float density, float friction, float restitution, int sensor) {
  b2PolygonShape shape;
  shape.SetAsBox(halfWidth, halfHeight, b2Vec2(x, y), angle);
  b2FixtureDef definition;
  definition.shape = &shape;
  definition.density = density;
  definition.friction = friction;
  definition.restitution = restitution;
  definition.isSensor = sensor != 0;
  return body->CreateFixture(&definition);
}
b2Fixture* pico_fixture_circle(b2Body* body, float radius, float x, float y,
                              float density, float friction, float restitution, int sensor) {
  b2CircleShape shape;
  shape.m_radius = radius;
  shape.m_p.Set(x, y);
  b2FixtureDef definition;
  definition.shape = &shape;
  definition.density = density;
  definition.friction = friction;
  definition.restitution = restitution;
  definition.isSensor = sensor != 0;
  return body->CreateFixture(&definition);
}
void pico_body_velocity(b2Body* body, float x, float y, float angular) {
  body->SetLinearVelocity(b2Vec2(x, y));
  body->SetAngularVelocity(angular);
}
void pico_body_linear_velocity(b2Body* body, float x, float y) { body->SetLinearVelocity(b2Vec2(x, y)); }
void pico_body_angular_velocity(b2Body* body, float angular) { body->SetAngularVelocity(angular); }
void pico_body_angular_damping(b2Body* body, float damping) { body->SetAngularDamping(damping); }
void pico_body_active(b2Body* body, int active) { body->SetActive(active != 0); }
void pico_body_transform(b2Body* body, float x, float y, float angle) { body->SetTransform(b2Vec2(x, y), angle); }
float pico_body_read(b2Body* body, int field) {
  switch (field) {
    case 0: return body->GetPosition().x;
    case 1: return body->GetPosition().y;
    case 2: return body->GetAngle();
    case 3: return body->GetLinearVelocity().x;
    case 4: return body->GetLinearVelocity().y;
    case 5: return body->GetAngularVelocity();
    case 6: return body->GetMass();
    case 7: return body->IsAwake() ? 1.0f : 0.0f;
    case 8: return body->IsActive() ? 1.0f : 0.0f;
    case 9: return body->GetAngularDamping();
    default: return 0.0f;
  }
}
b2Joint* pico_joint_revolute(b2World* world, b2Body* a, b2Body* b, float x, float y,
                             float lower, float upper, int limit, float speed, float torque, int motor) {
  b2RevoluteJointDef definition;
  definition.Initialize(a, b, b2Vec2(x, y));
  definition.lowerAngle = lower;
  definition.upperAngle = upper;
  definition.enableLimit = limit != 0;
  definition.motorSpeed = speed;
  definition.maxMotorTorque = torque;
  definition.enableMotor = motor != 0;
  return world->CreateJoint(&definition);
}
}
