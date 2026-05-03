declare module 'react-native-maps-clustering' {
  import { ComponentType } from 'react';
  import { MapViewProps } from 'react-native-maps';

  export interface ClusterProps {
    geometry: { coordinates: [number, number] };
    onPress: () => void;
    properties: { cluster_id: number; point_count: number };
  }

  export interface ClusteredMapViewProps extends MapViewProps {
    clusterColor?: string;
    radius?: number;
    renderCluster?: (cluster: ClusterProps) => React.ReactElement;
  }

  const ClusteredMapView: ComponentType<ClusteredMapViewProps>;
  export default ClusteredMapView;
}
