import "./timeline.css";

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import _ from 'lodash';
import Timeline, {
    TimelineMarkers,
    CustomMarker,
} from 'react-calendar-timeline';
import api from '../core/api-service.jsx';
import {CancelToken} from 'axios';
import { PrepareData } from '../core/table.jsx';
import VeloTimestamp from "../utils/time.jsx";
import VeloValueRenderer from '../utils/value.jsx';
import Form from 'react-bootstrap/Form';
import { JSONparse } from '../utils/json_parse.jsx';

// make sure you include the timeline stylesheet or the timeline will not be styled
import 'react-calendar-timeline/lib/Timeline.css';
import moment from 'moment';
import 'moment-timezone';
import Button from 'react-bootstrap/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Navbar from 'react-bootstrap/Navbar';
import T from '../i8n/i8n.jsx';
import Table from 'react-bootstrap/Table';
import ToolTip from '../widgets/tooltip.jsx';
import { ColumnToggle } from '../core/paged-table.jsx';
import Modal from 'react-bootstrap/Modal';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { ToStandardTime } from '../utils/time.jsx';

const TenYears =  10 * 365 * 24 * 60 * 60 * 1000;


const FixedColumns = {
    "Timestamp": 1,
    "Description": 1,
    "Message": 1,
}

class AnnotationDialog extends Component {
    static propTypes = {
        Timestamp: PropTypes.number,
        event: PropTypes.object,
        notebook_id: PropTypes.string,
        super_timeline: PropTypes.string,
        onClose: PropTypes.func,
    }

    state = {
        note: "",
    }

    componentDidMount = () => {
        this.source = CancelToken.source();
    }

    componentWillUnmount() {
        this.source.cancel();
    }

    updateNote = ()=>{
        api.post("v1/AnnotateTimeline", {
            notebook_id: this.props.notebook_id,
            super_timeline: this.props.super_timeline,
            timestamp: this.props.timestamp,
            note: this.state.note,
            event_json: JSON.stringify(this.props.event),
        }, this.source.token).then(response=>{
            this.props.onClose();
        });
    }

    render() {
        return <Modal show={true}
                      size="lg"
                      dialogClassName="modal-90w"
                      onHide={this.props.onClose}>
                 <Modal.Header closeButton>
                   <Modal.Title>{T("Annotate Event")}</Modal.Title>
                 </Modal.Header>
                 <Modal.Body>
                   <VeloValueRenderer value={this.props.event}/>
                   <Form>
                     <Form.Group as={Row}>
                       <Form.Label column sm="3">{T("Note")}</Form.Label>
                       <Col sm="8">
                         <Form.Control as="textarea" rows={1}
                                       placeholder={T("Enter short annotation")}
                                       spellCheck="true"
                                       value={this.state.note}
                                       onChange={e => this.setState({note: e.target.value})}
                         />
                         </Col>
                     </Form.Group>
                   </Form>
                 </Modal.Body>
                 <Modal.Footer>
                   <Button variant="secondary" onClick={this.props.onClose}>
                     {T("Close")}
                   </Button>
                   <Button variant="primary" onClick={this.updateNote}>
                     {T("Yes do it!")}
                   </Button>
                 </Modal.Footer>
               </Modal>;
    }
}


class TimelineTableRow extends Component {
    static propTypes = {
        row: PropTypes.object,
        columns: PropTypes.array,
        notebook_id: PropTypes.string,
        super_timeline: PropTypes.string,
        timeline_class: PropTypes.string,
        onUpdate: PropTypes.func,
    }

    state = {
        expanded: false,
        showAnnotateDialog: false,
    }

    renderCell = (column, rowIdx) => {
        let cell = this.props.row[column] || "";
        if(column === "Timestamp") {
            return <td key={column}>
                     <div className={this.props.timeline_class}>
                       <VeloTimestamp usec={cell}/>
                     </div>
                   </td>;
        }
        return <td key={column}> <VeloValueRenderer value={cell}/> </td>;
    };

    render() {
        let data = this.props.row || {};
        let row_class = "timeline-data ";
        if(!this.state.expanded) {
            row_class += "hidden";
        }

        let timestamp = ToStandardTime(data.Timestamp).getTime() * 1000000;

        return (
            <React.Fragment >
              <tr className="row-selected"
                  onClick={e=>this.setState({expanded: !this.state.expanded})}
                >
                {_.map(this.props.columns, this.renderCell)}
              </tr>
              <tr className={row_class}>
                <td colSpan="30">
                  { data._Source !== "Annotation" &&
                    <ButtonGroup>
                      <Button variant="default"
                              onClick={()=>this.setState(
                                  {showAnnotateDialog: true})}
                      >
                        <FontAwesomeIcon icon="note-sticky"/>
                      </Button>
                    </ButtonGroup>}
                  <VeloValueRenderer value={data} />
                </td>
              </tr>
              { this.state.showAnnotateDialog &&
                <AnnotationDialog
                  timestamp={timestamp}
                  notebook_id={this.props.notebook_id}
                  super_timeline={this.props.super_timeline}
                  event={data}
                  onClose={() => {
                      this.setState({showAnnotateDialog: false});
                      if(this.props.onUpdate) {
                          this.props.onUpdate();
                      };
                  }}
                />}
            </React.Fragment>
        );
    }
}



class TimelineTableRenderer  extends Component {
    static propTypes = {
        rows: PropTypes.array,
        timelines: PropTypes.object,
        extra_columns: PropTypes.array,
        notebook_id: PropTypes.string,
        super_timeline: PropTypes.string,
        onUpdate: PropTypes.func,
    }

    getTimelineClass = (name) => {
        let timelines = this.props.timelines.timelines;
        if (_.isArray(timelines)) {
            for(let i=0;i<timelines.length;i++) {
                if (timelines[i].id === name) {
                    return "timeline-item-" + (i + 1);
                };
            }
        }
        return "";
    }

    columns = ["Timestamp", "Message", "Description"];

    renderRow = (row, idx)=>{
        let columns = this.columns.concat(this.props.extra_columns);
        return (
            <TimelineTableRow
              key={idx}
              notebook_id={this.props.notebook_id}
              super_timeline={this.props.super_timeline}
              timeline_class={this.getTimelineClass(_.toString(row._Source))}
              row={row}
              columns={columns}
              onUpdate={this.props.onUpdate}
            />
        );
    }

    render() {
        if (_.isEmpty(this.props.rows)) {
            return <div className="no-content velo-table">{T("No events")}</div>;
        }

        return <Table className="paged-table">
                <thead>
                  <tr className="paged-table-header">
                    {_.map(this.columns, (x, i)=>{
                        return <th key={i} className={i == 0 ? "time" : ""}>
                                 { T(x) }
                               </th>;
                    })}
                    {_.map(this.props.extra_columns || [], (x, i)=>{
                        return <th key={i}>
                                 { x }
                               </th>;
                    })}
                  </tr>
                </thead>
                 <tbody className="fixed-table-body">
                   {_.map(this.props.rows, this.renderRow)}
                 </tbody>
               </Table>;
    }
}


export default class TimelineRenderer extends React.Component {
    static propTypes = {
        name: PropTypes.string,
        notebook_id: PropTypes.string,
        params: PropTypes.object,
    }

    componentDidMount = () => {
        this.source = CancelToken.source();
        this.fetchRows();
    }

    componentWillUnmount() {
        this.source.cancel();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (!_.isEqual(prevState.version, this.state.version)) {
            return true;
        }

        if (!_.isEqual(prevState.start_time, this.state.start_time)) {
            this.fetchRows();
            return true;
        };

        if (!_.isEqual(prevState.row_count, this.state.row_count)) {
            this.fetchRows();
            return true;
        };

        return false;
    }

    handleTimeChange = (visibleTimeStart, visibleTimeEnd) => {
        this.setState({
            visibleTimeStart,
            visibleTimeEnd,
            scrolling: true
        });
    };

    state = {
        start_time: 0,
        table_start: 0,
        table_end: 0,
        loading: true,
        disabled: {},
        version: 0,
        row_count: 10,
        visibleTimeStart: 0,
        visibleTimeEnd: 0,
        toggles: {},
    };

    fetchRows = () => {
        let skip_components = [];
        _.map(this.state.disabled, (v,k)=>{
            if(v) {
                skip_components.push(k);
            };
        });

        let start_time = this.state.start_time * 1000000;
        if (start_time < 1000000000) {
            start_time = 0;
        }

        let params = {
            type: "TIMELINE",
            timeline: this.props.name,
            start_time: start_time,
            rows: this.state.row_count,
            skip_components: skip_components,
            notebook_id: this.props.notebook_id,
        };

        let url = "v1/GetTable";

        this.source.cancel();
        this.source = CancelToken.source();

        this.setState({loading: true});

        api.get(url, params, this.source.token).then((response) => {
            if (response.cancel) {
                return;
            }
            let start_time = (response.data.start_time / 1000000) || 0;
            let end_time = (response.data.end_time / 1000000) || 0;
            let pageData = PrepareData(response.data);
            this.setState({
                table_start: start_time,
                table_end:  response.data.end_time / 1000000 || 0,
                columns: pageData.columns,
                rows: pageData.rows,
                version: Date(),
            });

            // If the visible table is outside the view port, adjust
            // the view port.
            if (this.state.visibleTimeStart === 0 ||
                start_time > this.state.visibleTimeEnd ||
                start_time < this.state.visibleTimeStart) {
                let diff = (this.state.visibleTimeEnd -
                            this.state.visibleTimeStart) || (60 * 60 * 10000);

                let visibleTimeStart = start_time - diff * 0.1;
                let visibleTimeEnd = start_time + diff * 0.9;
                this.setState({visibleTimeStart: visibleTimeStart,
                               visibleTimeEnd: visibleTimeEnd});
            }

            this.updateToggles(pageData.rows);
        });
    };

    groupRenderer = ({ group }) => {
        if (group.id < 0) {
            return <div>{group.title}</div>;
        }

        return (
            <Form>
              <Form.Check
                className="custom-group"
                type="checkbox"
                label={group.title}
                checked={!group.disabled}
                onChange={()=>{
                    let disabled = this.state.disabled;
                    disabled[group.id] = !disabled[group.id];
                    this.setState({disabled: disabled});
                    this.fetchRows();
                }}
              />
            </Form>
        );
    };

    pageSizeSelector = () => {
        let options = [10, 20, 50, 100];

        return <div className="btn-group" role="group">
                 { _.map(options, option=>{
                     return <button
                              key={ option }
                              type="button"
                              onClick={()=>this.setState({row_count: option})}
                              className={ `btn ${option === this.state.row_count ? 'btn-secondary' : 'btn-default'}` }
                            >
                              { option }
                            </button>;
                     }) }
               </div>;
    }

    nextPage = ()=>{
        if (this.state.table_end > 0) {
            this.setState({start_time: this.state.table_end + 1});
        }
    }

    updateToggles = rows=>{
        // Find all unique columns
        let _columns={};
        let columns = [];
        let toggles = {...this.state.toggles};

        _.each(this.state.rows, row=>{
            _.each(row, (v, k)=>{
                if (_.isUndefined(_columns[k]) && !FixedColumns[k]) {
                    _columns[k]=1;
                    columns.push(k);

                    if(_.isUndefined(toggles[k])) {
                        toggles[k] = true;
                    }
                }
            });
        });

        this.setState({toggles: toggles, columns: columns});
    }

    renderColumnSelector = ()=>{
        return (
            <ColumnToggle
              columns={this.state.columns}
              toggles={this.state.toggles}
              onToggle={c=>{
                  if(c) {
                      let toggles = this.state.toggles;
                      toggles[c] = !toggles[c];
                      this.setState({toggles: toggles});
                  }
              }}
            />
        );
    }

    render() {
        let super_timeline = {timelines:[]};
        if (_.isString(this.props.params)) {
            super_timeline = JSONparse(this.props.params);
            if(!super_timeline) {
                return <></>;
            }
        } else if(_.isObject(this.props.params)) {
            super_timeline = this.props.params;
        }

        let groups = [{id: -1, title: "Table View"}];
        let items = [{
            id:-1, group: -1,
            start_time: this.state.table_start,
            end_time: this.state.table_end,
            canMove: false,
            canResize: false,
            canChangeGroup: false,
            itemProps: {
                className: 'timeline-table-item',
                style: {
                    background: undefined,
                    color: undefined,
                },
            },
        }];
        let smallest = 10000000000000000;
        let largest = 0;
        let timelines = super_timeline.timelines || [];

        for (let i=0;i<timelines.length;i++) {
            let timeline = super_timeline.timelines[i];
            let start = timeline.start_time * 1000;
            let end = timeline.end_time * 1000;
            if (start < smallest) {
                smallest = start;
            }

            if (end > largest) {
                largest = end;
            }

            groups.push({
                id: timeline.id,
                disabled: this.state.disabled[timeline.id],
                title: timeline.id,
            });
            items.push({
                id: i+1, group: timeline.id,
                start_time: start,
                end_time: end,
                canMove: false,
                canResize: false,
                canChangeGroup: false,
                itemProps: {
                    className: 'timeline-item-' + ((i + 1) % 8),
                    style: {
                        background: undefined,
                        color: undefined,
                    }
                },
            });
        }

        if (smallest > largest) {
            smallest = largest;
        }

        if (_.isNaN(smallest) || smallest < 0) {
            smallest = 0;
            largest = 0;
        }

        if (largest - smallest > TenYears) {
            largest = smallest + TenYears;
        }

        let extra_columns = [];
        _.each(this.state.toggles, (v,k)=>{
            if(!v) { extra_columns.push(k); }});

        return <div className="super-timeline">Super-timeline {this.props.name}
                 <Navbar className="toolbar">
                   <ButtonGroup>
                     { this.renderColumnSelector() }
                     { this.pageSizeSelector() }
                     <Button title="Next"
                             onClick={() => {this.nextPage(); }}
                             variant="default">
                       <FontAwesomeIcon icon="forward"/>
                     </Button>
                   </ButtonGroup>
                 </Navbar>
                 <Timeline
                   groups={groups}
                   items={items}
                   defaultTimeStart={moment(smallest).add(-1, "day")}
                   defaultTimeEnd={moment(largest).add(1, "day")}
                   itemTouchSendsClick={true}
                   minZoom={5*60*1000}
                   dragSnap={1000}
                   onCanvasClick={(groupId, time, e) => {
                       this.setState({start_time: time});
                   }}
                   onItemSelect={(itemId, e, time) => {
                       this.setState({start_time: time});
                       return false;
                   }}
                   onItemClick={(itemId, e, time) => {
                       this.setState({start_time: time});
                       return false;
                   }}
                   groupRenderer={this.groupRenderer}
                   onTimeChange={this.handleTimeChange}
                   visibleTimeStart={this.state.visibleTimeStart}
                   visibleTimeEnd={this.state.visibleTimeEnd}
                 >
                   <TimelineMarkers>
                     <CustomMarker
                       date={this.state.start_time} >
                       { ({ styles, date }) => {
                           styles.backgroundColor = undefined;
                           styles.width = undefined;
                           return <div style={styles}
                                       className="timeline-marker"
                                  />;
                       }}
                     </CustomMarker>
                   </TimelineMarkers>
                 </Timeline>
                 { this.state.columns &&
                   <TimelineTableRenderer
                     super_timeline={this.props.name}
                     notebook_id={this.props.notebook_id}
                     timelines={super_timeline}
                     extra_columns={extra_columns}
                     onUpdate={this.fetchRows}
                     rows={this.state.rows} />
                 }
               </div>;
    }
}
