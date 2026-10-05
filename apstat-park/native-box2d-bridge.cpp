// Project-owned C ABI for the unmodified, pinned Box2D 2.3.1 source.
// Units are Box2D meters/seconds except the explicitly native rectangle helper.
#include <Box2D/Box2D.h>
static b2RayCastOutput lastRayCast;

extern "C" {
b2World* pico_world_create(float x, float y) { return new b2World(b2Vec2(x, y)); }
void pico_world_destroy(b2World* world) { delete world; }
void pico_world_step(b2World* world, float dt, int velocityIterations, int positionIterations) {
  world->Step(dt, velocityIterations, positionIterations);
}
// bbe7770 deliberately scans shapes, not the broadphase World::RayCast API.
b2Body* pico_world_ray_cast(b2World* world, float x1, float y1, float x2, float y2) {
  b2RayCastInput input;
  input.p1.Set(x1, y1);
  input.p2.Set(x2, y2);
  input.maxFraction = 1.0f;
  float closest = 2.0f; // bcff5c0
  b2Body* found = 0;
  for (b2Body* body = world->GetBodyList(); body; body = body->GetNext()) {
    for (b2Fixture* fixture = body->GetFixtureList(); fixture; fixture = fixture->GetNext()) {
      b2RayCastOutput output;
      if (fixture->GetShape()->RayCast(&output, input, body->GetTransform(), 0) && output.fraction < closest) {
        closest = output.fraction;
        lastRayCast = output;
        found = body;
      }
    }
  }
  return found;
}
float pico_ray_read(int field) {
  if (field == 0) return lastRayCast.fraction;
  return field == 1 ? lastRayCast.normal.x : lastRayCast.normal.y;
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
b2Joint* pico_joint_local_revolute(b2World* world, b2Body* a, b2Body* b,
                                  float ax, float ay, float bx, float by,
                                  float lower, float upper, int limit, int collide) {
  b2RevoluteJointDef definition;
  definition.bodyA = a;
  definition.bodyB = b;
  definition.localAnchorA.Set(ax, ay);
  definition.localAnchorB.Set(bx, by);
  definition.lowerAngle = lower;
  definition.upperAngle = upper;
  definition.enableLimit = limit != 0;
  definition.collideConnected = collide != 0;
  return world->CreateJoint(&definition);
}
void pico_joint_destroy(b2World* world, b2Joint* joint) { world->DestroyJoint(joint); }
b2Joint* pico_joint_gear(b2World* world, b2Body* a, b2Body* b, b2Joint* first, b2Joint* second,
                         float ratio, int collide) {
  b2GearJointDef definition;
  definition.bodyA = a;
  definition.bodyB = b;
  definition.joint1 = first;
  definition.joint2 = second;
  definition.ratio = ratio;
  definition.collideConnected = collide != 0;
  return world->CreateJoint(&definition);
}
float pico_gear_ratio(b2GearJoint* joint) { return joint->GetRatio(); }
float pico_revolute_read(b2RevoluteJoint* joint, int field) {
  switch (field) {
    case 0: return joint->GetLocalAnchorA().x;
    case 1: return joint->GetLocalAnchorA().y;
    case 2: return joint->GetLocalAnchorB().x;
    case 3: return joint->GetLocalAnchorB().y;
    case 4: return joint->GetReferenceAngle();
    case 5: return joint->GetJointAngle();
    case 6: return joint->GetLowerLimit();
    case 7: return joint->GetUpperLimit();
    case 8: return joint->IsLimitEnabled() ? 1.0f : 0.0f;
    case 9: return joint->GetCollideConnected() ? 1.0f : 0.0f;
    default: return 0.0f;
  }
}
}
