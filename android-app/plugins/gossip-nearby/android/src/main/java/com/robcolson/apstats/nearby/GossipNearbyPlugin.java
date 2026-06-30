package com.robcolson.apstats.nearby;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * GossipNearby — a Capacitor transport for ledger-gossip.js over Google Nearby
 * Connections (ANDROID Phase 3). P2P_CLUSTER lets every phone advertise AND
 * discover simultaneously (a mesh, not star), auto-connecting nearby peers over
 * Bluetooth / BLE / Wi-Fi Direct with no pairing. Messages are framed JSON strings
 * (the gossip protocol); integrity is enforced ABOVE this layer (verify-on-ingest),
 * so connections are auto-accepted — a peer can only deliver bytes, never forge a
 * signed grade.
 *
 * JS contract (GossipTransport):
 *   start()           -> begins advertising + discovery
 *   send(peerId,msg)  -> sends a framed string to one endpoint
 *   stop()            -> tears everything down
 *   events: "peer" {peerId,name}, "message" {peerId,message}, "lost" {peerId}
 */
@CapacitorPlugin(
    name = "GossipNearby",
    permissions = {
        @Permission(
            alias = "nearby",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.NEARBY_WIFI_DEVICES
            }
        )
    }
)
public class GossipNearbyPlugin extends Plugin {

    private static final String SERVICE_ID = "com.robcolson.apstats.gossip.v1";
    private static final Strategy STRATEGY = Strategy.P2P_CLUSTER;

    private ConnectionsClient connections;
    private String localName;
    private boolean running = false;

    private ConnectionsClient connections() {
        if (connections == null) connections = Nearby.getConnectionsClient(getContext());
        return connections;
    }

    // ── start ────────────────────────────────────────────────────────────────
    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("nearby") == PermissionState.GRANTED) {
            doStart(call);
        } else {
            requestPermissionForAlias("nearby", call, "afterPerm");
        }
    }

    @PermissionCallback
    private void afterPerm(PluginCall call) {
        // Proceed even if some perms are reported ungranted: the granular BT perms
        // don't exist below API 31 and NEARBY_WIFI_DEVICES below API 33, so a strict
        // gate would wrongly block older devices. Nearby surfaces a real failure via
        // the start task listeners if a needed permission is actually missing.
        doStart(call);
    }

    private void doStart(PluginCall call) {
        if (running) { call.resolve(); return; }
        localName = "apstats-" + UUID.randomUUID().toString().substring(0, 8);

        connections()
            .startAdvertising(localName, SERVICE_ID, connectionLifecycle,
                new AdvertisingOptions.Builder().setStrategy(STRATEGY).build())
            .addOnSuccessListener(unused -> {
                connections()
                    .startDiscovery(SERVICE_ID, endpointDiscovery,
                        new DiscoveryOptions.Builder().setStrategy(STRATEGY).build())
                    .addOnSuccessListener(u2 -> { running = true; call.resolve(); })
                    .addOnFailureListener(e -> call.reject("startDiscovery failed: " + e.getMessage()));
            })
            .addOnFailureListener(e -> call.reject("startAdvertising failed: " + e.getMessage()));
    }

    // ── send ─────────────────────────────────────────────────────────────────
    @PluginMethod
    public void send(PluginCall call) {
        String peerId = call.getString("peerId");
        String message = call.getString("message");
        if (peerId == null || message == null) { call.reject("peerId and message are required"); return; }
        Payload payload = Payload.fromBytes(message.getBytes(StandardCharsets.UTF_8));
        connections().sendPayload(peerId, payload)
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(e -> call.reject("sendPayload failed: " + e.getMessage()));
    }

    // ── stop ─────────────────────────────────────────────────────────────────
    @PluginMethod
    public void stop(PluginCall call) {
        if (connections != null) {
            try { connections.stopAdvertising(); } catch (Exception ignored) {}
            try { connections.stopDiscovery(); } catch (Exception ignored) {}
            try { connections.stopAllEndpoints(); } catch (Exception ignored) {}
        }
        running = false;
        call.resolve();
    }

    // ── Nearby callbacks ───────────────────────────────────────────────────────

    private final EndpointDiscoveryCallback endpointDiscovery = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(String endpointId, DiscoveredEndpointInfo info) {
            // Symmetric: both peers request; Nearby resolves to a single connection.
            connections().requestConnection(localName, endpointId, connectionLifecycle);
        }

        @Override
        public void onEndpointLost(String endpointId) {
            emit("lost", endpointId, null, null);
        }
    };

    private final ConnectionLifecycleCallback connectionLifecycle = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String endpointId, ConnectionInfo info) {
            // Auto-accept: trust is enforced at the receipt layer, not the transport.
            connections().acceptConnection(endpointId, payloadCallback);
        }

        @Override
        public void onConnectionResult(String endpointId, ConnectionResolution result) {
            if (result.getStatus().getStatusCode() == ConnectionsStatusCodes.STATUS_OK) {
                emit("peer", endpointId, null, null);
            }
        }

        @Override
        public void onDisconnected(String endpointId) {
            emit("lost", endpointId, null, null);
        }
    };

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String endpointId, Payload payload) {
            if (payload.getType() == Payload.Type.BYTES && payload.asBytes() != null) {
                String msg = new String(payload.asBytes(), StandardCharsets.UTF_8);
                emit("message", endpointId, msg, null);
            }
        }

        @Override
        public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) {
            // No-op: gossip messages are small single-chunk BYTES payloads.
        }
    };

    private void emit(String event, String peerId, String message, String name) {
        JSObject data = new JSObject();
        if (peerId != null) data.put("peerId", peerId);
        if (message != null) data.put("message", message);
        if (name != null) data.put("name", name);
        notifyListeners(event, data);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (connections != null) {
            try { connections.stopAllEndpoints(); } catch (Exception ignored) {}
        }
        running = false;
    }
}
